'use server';

import { getInvestments } from '@/lib/firestore';
import { db } from '@/lib/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import type { Investment } from '@/lib/types';
import axios from 'axios';
import { headers } from 'next/headers';
import { initializeApp, getApp, cert, deleteApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const getAdminApp = () => {
  try {
    return getApp('admin');
  } catch (error) {
    if ((error as any).code === 'app/no-app') {
      console.log("Initializing Firebase Admin SDK...");
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      };
      if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
        throw new Error('Firebase Admin SDK credentials are not set in .env.local');
      }
      return initializeApp({
        credential: cert(serviceAccount),
      }, 'admin');
    }
    throw error;
  }
};


// Helper to get the currently authenticated user on the server
async function getAuthenticatedUser() {
  const session = headers().get('x-firebase-session');
  if (!session) {
    console.log('No session cookie found.');
    return null;
  }

  try {
    const adminApp = getAdminApp();
    const adminAuth = getAdminAuth(adminApp);
    // Here we are verifying the ID token sent from the client
    const decodedToken = await adminAuth.verifyIdToken(session);
    return decodedToken;
  } catch (error: any) {
    console.error('Error verifying ID token:', error.message);
    if (error.code === 'auth/id-token-revoked' || error.code === 'auth/id-token-expired') {
        // Handle revoked or expired token
    }
    return null;
  }
}

interface UpdateResult {
  success: boolean;
  updated: number;
  failed: number;
  message: string;
}

// Fetches price from Yahoo Finance for Stocks/ETFs
async function getStockPrice(ticker: string): Promise<number | null> {
  if (!ticker) return null;
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`);
    const result = response.data.quoteResponse.result[0];
    if (result && result.regularMarketPrice) {
      return result.regularMarketPrice;
    }
    return null;
  } catch (error) {
    console.warn(`Failed to fetch price for stock/ETF ticker: ${ticker}`, error);
    return null;
  }
}

// Fetches price from CoinGecko for Crypto
async function getCryptoPrice(id: string): Promise<number | null> {
  if (!id) return null;
  try {
    const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${id.toLowerCase()}&vs_currencies=eur`);
    const price = response.data[id.toLowerCase()]?.eur;
    return price || null;
  } catch (error) {
    console.warn(`Failed to fetch price for crypto ID: ${id}`, error);
    return null;
  }
}

export async function refreshInvestmentPrices(): Promise<UpdateResult> {
  const user = await getAuthenticatedUser();

  if (!user) {
    return { success: false, updated: 0, failed: 0, message: 'Authentication failed. Please sign in again.' };
  }

  try {
    const investments = await getInvestments(user.uid);
    const batch = writeBatch(db);
    let updatedCount = 0;
    let failedCount = 0;

    const priceFetchPromises = investments.map(async (inv) => {
      let newPrice: number | null = null;
      if ((inv.type === 'Stock' || inv.type === 'ETF') && inv.ticker) {
        newPrice = await getStockPrice(inv.ticker);
      } else if (inv.type === 'Crypto' && inv.ticker) {
        newPrice = await getCryptoPrice(inv.ticker);
      }

      if (newPrice !== null && newPrice !== inv.currentValue) {
        const investmentRef = doc(db, 'users', user.uid, 'investments', inv.id);
        batch.update(investmentRef, { currentValue: newPrice });
        updatedCount++;
      } else if (newPrice === null && (inv.type === 'Stock' || inv.type === 'ETF' || inv.type === 'Crypto')) {
        failedCount++;
      }
    });

    await Promise.all(priceFetchPromises);

    if (updatedCount > 0) {
      await batch.commit();
    }
    
    let message = `Successfully updated ${updatedCount} investments.`;
    if (failedCount > 0) {
        message += ` Failed to fetch prices for ${failedCount} investments. Please check their tickers.`;
    }
    if(updatedCount === 0 && failedCount === 0) {
        message = 'All investment prices are already up-to-date.'
    }

    return { success: true, updated: updatedCount, failed: failedCount, message };
  } catch (error) {
    console.error('Error refreshing investment prices:', error);
    return { success: false, updated: 0, failed: 0, message: 'An unexpected error occurred while refreshing prices.' };
  }
}
