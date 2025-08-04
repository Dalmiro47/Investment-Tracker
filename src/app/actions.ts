'use server';

import type { Investment } from '@/lib/types';
import axios from 'axios';

interface UpdateResult {
  success: boolean;
  message: string;
  updatedInvestments: Investment[];
}

// Fetches price from Yahoo Finance for Stocks/ETFs
async function getStockPrice(ticker: string): Promise<number | null> {
  if (!ticker) return null;
  try {
    // Using the v8 chart endpoint can be more reliable
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?region=DE&lang=en-US&interval=1d&range=1d`);
    const result = response.data?.chart?.result?.[0];
    const meta = result?.meta;
    
    // Prioritize the most "live" price available
    const price = meta?.preMarketPrice || meta?.postMarketPrice || meta?.regularMarketPrice;
    
    if (price) {
      return price;
    }
    console.warn(`Price not found in response for stock/ETF ticker: ${ticker}`, response.data);
    return null;
  } catch (error: any) {
    // Log more detailed error information
    console.error(`Failed to fetch price for stock/ETF ticker: ${ticker}. Status: ${error.response?.status}. Data: ${JSON.stringify(error.response?.data)}`);
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

export async function refreshInvestmentPrices(currentInvestments: Investment[]): Promise<UpdateResult> {
  try {
    let failedCount = 0;
    const investmentsToUpdate: Investment[] = [];

    const priceFetchPromises = currentInvestments.map(async (inv) => {
      let newPrice: number | null = null;
      if ((inv.type === 'Stock' || inv.type === 'ETF') && inv.ticker) {
        newPrice = await getStockPrice(inv.ticker);
      } else if (inv.type === 'Crypto' && inv.ticker) {
        newPrice = await getCryptoPrice(inv.ticker);
      }

      if (newPrice !== null && newPrice !== inv.currentValue) {
        // Create a new object with the updated price to return
        investmentsToUpdate.push({ ...inv, currentValue: newPrice });
      } else if (newPrice === null && (inv.type === 'Stock' || inv.type === 'ETF' || inv.type === 'Crypto')) {
        failedCount++;
      }
    });

    await Promise.all(priceFetchPromises);
    
    const updatedCount = investmentsToUpdate.length;

    let message = `Successfully updated ${updatedCount} investments.`;
    if (failedCount > 0) {
        message += ` Failed to fetch prices for ${failedCount} investments. Please check their tickers.`;
    }
    if(updatedCount === 0 && failedCount === 0) {
        message = 'All investment prices are already up-to-date.'
    }

    return { success: true, updatedInvestments: investmentsToUpdate, message };
  } catch (error) {
    console.error('Error refreshing investment prices:', error);
    return { success: false, updatedInvestments: [], message: 'An unexpected error occurred while refreshing prices.' };
  }
}
