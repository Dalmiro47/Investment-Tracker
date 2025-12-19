'use server';

import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDailyEurRate } from '@/lib/providers/frankfurter';
import type { InvestmentType, FuturePosition, Transaction } from '@/lib/types';

const KRAKEN_FUTURES_BASE_URL = 'https://futures.kraken.com';

// --- Types strictly aligned with Kraken Futures V3 Schema ---
type KrakenResponse<T> = { 
  result: 'success' | 'error'; 
  serverTime: string;
  error?: string; 
} & T;

type KrakenOpenPosition = {
  side: 'long' | 'short';
  symbol: string;
  price: number;
  size: number;
  fillTime: string;
  maxFixedLeverage?: number;
};

type KrakenFill = {
  fill_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  fillTime: string;
  fillType: string;
  order_id: string;
};

// --- Helper: Asset Mapping ---
function mapKrakenSymbol(symbol: string) {
  const clean = symbol.toUpperCase().replace('PI_', '').replace('PF_', '').replace('FI_', '').replace('USD', '');
  return {
    ticker: `${clean}-PERP`,
    name: `${clean} Perpetual`,
    asset: clean.includes('XBT') ? 'BTC' : clean
  };
}

// --- Auth Logic (Verified with test script) ---
function getKrakenFuturesSignature(path: string, nonce: string, queryString: string, secret: string) {
  const signaturePath = path.replace('/derivatives', '');
  const message = queryString + nonce + signaturePath;
  const hash = crypto.createHash('sha256').update(message).digest('binary');
  const secretBuffer = Buffer.from(secret.trim(), 'base64');
  
  return crypto
    .createHmac('sha512', secretBuffer)
    .update(hash, 'binary')
    .digest('base64');
}

async function fetchKrakenFutures<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = process.env.KRAKEN_FUTURES_KEY?.trim();
  const apiSecret = process.env.KRAKEN_FUTURES_SECRET?.trim();

  if (!apiKey || !apiSecret) throw new Error('API Keys missing in environment');

  const nonce = Date.now().toString();
  const queryString = new URLSearchParams(params).toString();
  const authent = getKrakenFuturesSignature(path, nonce, queryString, apiSecret);

  const url = `${KRAKEN_FUTURES_BASE_URL}${path}${queryString ? `?${queryString}` : ''}`;
  
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'APIKey': apiKey,
      'Authent': authent,
      'Nonce': nonce,
      'User-Agent': 'InvestmentTracker/1.1',
    },
    cache: 'no-store'
  });

  const data = await res.json();
  if (data.result !== 'success') {
    throw new Error(data.error || 'Unknown Kraken Error');
  }
  return data as T;
}

// --- Main Sync Action ---
export async function syncKrakenFutures(userId: string) {
  if (!userId) return { ok: false, message: 'No user ID provided' };

  try {
    const userRef = adminDb.collection('users').doc(userId);
    const batch = adminDb.batch();
    
    // 1. Fetch Open Positions
    const posData = await fetchKrakenFutures<KrakenResponse<{ openPositions: KrakenOpenPosition[] }>>('/derivatives/api/v3/openpositions');
    const positionsCol = userRef.collection('futures_positions');
    
    for (const pos of (posData.openPositions || [])) {
      const { ticker } = mapKrakenSymbol(pos.symbol);
      const posRef = positionsCol.doc(ticker);
      
      // Fetch exchange rate for EUR conversion (German tax compliance)
      const posDate = new Date(pos.fillTime);
      let exchangeRate = 0.85; // Fallback
      try {
        exchangeRate = await getDailyEurRate(posDate, 'USD');
      } catch (e) {
        console.warn(`Failed to fetch exchange rate for ${pos.fillTime}, using fallback`);
      }
      
      // Calculate EUR values
      const entryPriceEur = pos.price * exchangeRate;
      const sizeValueUsd = pos.size * pos.price;
      const sizeValueEur = pos.size * entryPriceEur;
      
      batch.set(posRef, {
        id: ticker,
        asset: ticker.split('-')[0],
        side: pos.side.toUpperCase(),
        leverage: pos.maxFixedLeverage || 1,
        
        // USD values (raw)
        entryPrice: pos.price,
        entryPriceUsd: pos.price,
        
        // EUR values (for German tax)
        entryPriceEur: entryPriceEur,
        valueInEur: sizeValueEur,
        
        // Position details
        size: pos.size,
        collateral: sizeValueEur, // Display collateral in EUR
        
        // Currency metadata
        currency: 'USD',
        baseCurrency: 'EUR',
        exchangeRate: exchangeRate,
        
        status: 'OPEN',
        openedAt: Timestamp.fromDate(posDate),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    // 2. Fetch Fills (With Pagination)
    let lastFillTime: string | undefined;
    const allFills: KrakenFill[] = [];
    
    // Fetch up to 300 recent fills (3 pages) to avoid hitting Firestore limits in one go
    for (let i = 0; i < 3; i++) {
      const params = lastFillTime ? { lastFillTime } : {};
      const fillData = await fetchKrakenFutures<KrakenResponse<{ fills: KrakenFill[] }>>('/derivatives/api/v3/fills', params);
      
      if (!fillData.fills || fillData.fills.length === 0) break;
      
      allFills.push(...fillData.fills);
      lastFillTime = fillData.fills[fillData.fills.length - 1].fillTime;
      
      if (fillData.fills.length < 100) break; 
    }

    const investmentsCol = userRef.collection('investments');

    for (const fill of allFills) {
      const { ticker, name } = mapKrakenSymbol(fill.symbol);
      const invId = `FUTURE-${ticker}`;
      const invRef = investmentsCol.doc(invId);
      const txRef = invRef.collection('transactions').doc(fill.fill_id);

      const date = new Date(fill.fillTime);
      const eurRate = await getDailyEurRate(date, 'USD');
      
      batch.set(invRef, {
        id: invId,
        type: 'Future',
        ticker: ticker,
        name: name,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      batch.set(txRef, {
        id: fill.fill_id,
        type: fill.side === 'buy' ? 'Buy' : 'Sell',
        date: date.toISOString(),
        quantity: fill.size,
        pricePerUnit: fill.price,
        totalAmount: fill.size * fill.price,
        currency: 'USD',
        exchangeRate: eurRate,
        valueInEur: (fill.size * fill.price) * eurRate,
        status: 'COMPLETED',
        metadata: { fillType: fill.fillType, orderId: fill.order_id }
      }, { merge: true });
    }

    await batch.commit();
    return { 
      ok: true, 
      message: `Synced ${posData.openPositions?.length || 0} positions and ${allFills.length} historical fills.` 
    };

  } catch (err: any) {
    console.error('Kraken Sync Error:', err);
    return { ok: false, message: err.message };
  }
}