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

type KrakenAccountLog = {
  booking_uid: string;
  date: string;
  asset: string;
  info: string;
  contract?: string;
  realized_funding: number | null;
  realized_pnl: number | null;
  fee: number | null;
  margin_account: string;
  old_balance?: number;
  new_balance?: number;
  // NEW: Critical field for Audit Entry Price
  old_average_entry_price?: number;
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

// --- Helper: Session-Based ID Strategy ---
// Kraken Futures aggregates positions by ticker.
function getSessionId(ticker: string): string {
  return ticker;
}

// 2. LOGIC: The History Walk Helper (CORRECTED)
// Traces net inventory backwards until balance was zero to find true 'Open Date'
function findOpenDateForClosure(assetFills: any[], closingFillTime: string) {
  // 1. Get all fills for this asset before the closing time, newest to oldest
  const history = assetFills
    .filter(f => new Date(f.fillTime) <= new Date(closingFillTime))
    .sort((a, b) => new Date(b.fillTime).getTime() - new Date(a.fillTime).getTime());

  if (history.length === 0) return new Date(closingFillTime);

  let runningNetBalance = 0;
  let trueOpeningDate = new Date(history[0].fillTime);

  // 2. Trace backwards. 
  // Note: We use the inverted logic because we are walking back from the CLOSE.
  // If a closing trade was a 'buy', the opening trades were 'sell'.
  for (const fill of history) {
    const fillSize = Number(fill.size);
    // In walk-back: 'buy' fills subtract from inventory, 'sell' fills add to it
    if (fill.side === 'buy') {
      runningNetBalance -= fillSize;
    } else {
      runningNetBalance += fillSize;
    }

    trueOpeningDate = new Date(fill.fillTime);

    // 3. The moment the running balance hits zero (or crosses it), 
    // the fill that caused this change is the start of the session.
    if (Math.abs(runningNetBalance) < 0.000001) {
      break;
    }
  }

  return trueOpeningDate;
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
  
  // FIX: Only throw if the API explicitly reports an error.
  // The Account Log API doesn't send a "result: success" field.
  if (data.result === 'error') {
    console.error('❌ Kraken API Error:', data.error);
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
    
    // 1. Fetch Open Positions with SESSION-BASED ID: ${ticker}-${hourlyBucket}
    const posData = await fetchKrakenFutures<KrakenResponse<{ openPositions: KrakenOpenPosition[] }>>('/derivatives/api/v3/openpositions');
    const positionsCol = userRef.collection('futures_positions');
    
    // Get all existing position documents to detect closed positions
    const existingPositionsSnapshot = await positionsCol.get();
    const openSessionIds = new Set<string>();
    
    for (const pos of (posData.openPositions || [])) {
      const { ticker, asset } = mapKrakenSymbol(pos.symbol);
      const posDate = new Date(pos.fillTime);
      
      // UNIFIED ID: Session is defined by ticker
      // This allows us to track the current live state of a position
      const sessionId = getSessionId(ticker);
      openSessionIds.add(sessionId);
      const posRef = positionsCol.doc(sessionId);
      
      // Fetch exchange rate for EUR conversion (German tax compliance)
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
        id: sessionId,
        ticker: ticker,
        asset: asset,
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

    // Remove positions that are no longer OPEN in Kraken
    // We delete them because the permanent record of closures is created from the account logs
    for (const doc of existingPositionsSnapshot.docs) {
      const sessionId = doc.id;
      const data = doc.data();
      
      // If position was OPEN but is no longer in the API response, delete it
      if (data.status === 'OPEN' && !openSessionIds.has(sessionId)) {
        batch.delete(positionsCol.doc(sessionId));
      }
    }

    // 2. Fetch Fills (With Pagination)
    let lastFillTime: string | undefined;
    const allFills: KrakenFill[] = [];
    
    // Fetch up to 300 recent fills (3 pages) to avoid hitting Firestore limits in one go
    for (let i = 0; i < 3; i++) {
      const params: Record<string, string> = lastFillTime ? { lastFillTime } : {};
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

    // 3. Fetch Account Logs (Funding, P&L, Fees) → kraken_logs
    const accountLogData = await fetchKrakenFutures<any>('/api/history/v3/account-log', { count: '100' });
    
    // The data is the object itself containing the logs array
    const logs = accountLogData.logs || [];
    const logsCol = userRef.collection('kraken_logs');

    console.log(`📥 Processing ${logs.length} account log entries...`);

    // ⚡ PERFORMANCE FIX: Cache exchange rates by date to avoid repeated API calls
    const rateCache = new Map<string, number>();
    const getCachedRate = async (date: Date): Promise<number> => {
      const dateStr = date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      if (rateCache.has(dateStr)) {
        return rateCache.get(dateStr)!;
      }
      let rate = 0.85; // Fallback
      try {
        rate = await getDailyEurRate(date, 'USD');
      } catch (e) {
        console.warn(`⚠️  Failed to fetch exchange rate for ${dateStr}, using fallback 0.85`);
      }
      rateCache.set(dateStr, rate);
      return rate;
    };

    // Track closed positions from logs to avoid duplicate CLOSED records
    const closedPositionIds = new Set<string>();

    for (const log of logs) {
      if (!log.booking_uid) continue;

      const logRef = logsCol.doc(log.booking_uid);
      const logDate = new Date(log.date);
      
      // ⚡ Use cached rate instead of calling API every time
      const exchangeRate = await getCachedRate(logDate);

      // Use Number() to safely parse strings from the API
      const realizedFunding = Number(log.realized_funding || 0);
      const realizedPnl = Number(log.realized_pnl || 0);
      const fee = Number(log.fee || 0);

      // Skip logs with no financial impact to save Firestore quota
      if (realizedPnl === 0 && realizedFunding === 0 && fee === 0) continue;

      // Convert to EUR for German tax compliance
      const realizedFundingEur = realizedFunding * exchangeRate;
      const realizedPnlEur = realizedPnl * exchangeRate;
      const feeEur = fee * exchangeRate;

      batch.set(logRef, {
        booking_uid: log.booking_uid,
        date: log.date,
        asset: log.asset,
        contract: log.contract,
        info: log.info,
        margin_account: log.margin_account,
        
        // Raw USD values
        realized_funding: realizedFunding,
        realized_pnl: realizedPnl,
        fee: fee,
        
        // EUR converted values (for §20 tax reporting)
        realizedFundingEur: realizedFundingEur,
        realizedPnlEur: realizedPnlEur,
        feeEur: feeEur,
        
        // Currency metadata
        currency: 'USD',
        baseCurrency: 'EUR',
        exchangeRate: exchangeRate,
        
        // Timestamps
        timestamp: Timestamp.fromDate(logDate),
        syncedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // HEAVY LIFTING: JOIN Operation between Financial Ledger (logs) and Execution Ledger (fills)
      // Target only the financial realization events
      if (log.info === 'realized_pnl' || (log.info === 'futures trade' && realizedPnl !== 0)) {
        const matchingFill = allFills.find(f => f.fill_id === log.execution);

        if (matchingFill) {
          const { ticker, asset: assetName } = mapKrakenSymbol(matchingFill.symbol);
          const logDate = new Date(log.date);
          const exchangeRate = await getCachedRate(logDate);

          // Filter fills for this specific contract to run the walk-back
          const assetFills = allFills.filter(f => f.symbol === matchingFill.symbol);
          
          // EXECUTE CORRECTED HISTORY WALK
          const openedAtDate = findOpenDateForClosure(assetFills, matchingFill.fillTime);

          // HEAVY LIFTING: Math Fallback for Entry Price
          // If the API returns 0 for entry price, we reverse-calculate it from PnL
          let auditEntryPrice = Number(log.old_average_entry_price || 0);
          
          if (auditEntryPrice === 0 && matchingFill.size > 0) {
            const pnlPerUnit = Number(log.realized_pnl || 0) / matchingFill.size;
            
            // If we BOUGHT to close (Short), Entry was HIGHER than Exit (Exit + Profit)
            // If we SOLD to close (Long), Entry was LOWER than Exit (Exit - Profit)
            if (matchingFill.side === 'buy') {
               auditEntryPrice = matchingFill.price + pnlPerUnit;
            } else {
               auditEntryPrice = matchingFill.price - pnlPerUnit;
            }
          }

          const uniqueId = `CLOSED-${log.booking_uid}`;
          const posRef = positionsCol.doc(uniqueId);

          batch.set(posRef, {
            id: uniqueId,
            asset: assetName,
            ticker: ticker,
            status: 'CLOSED',
            
            // Execution Data (Market)
            side: matchingFill.side === 'buy' ? 'SHORT' : 'LONG',
            size: matchingFill.size,
            exitPrice: matchingFill.price,
            
            // Financial Data (Source of Truth)
            entryPrice: auditEntryPrice, // FIXED: Now populated by math fallback
            realizedPnL: Number(log.realized_pnl || 0),
            realizedPnlEur: Number(log.realized_pnl || 0) * exchangeRate,
            feeEur: Number(log.fee || 0) * exchangeRate,
            
            // Timestamps
            openedAt: Timestamp.fromDate(openedAtDate),
            closedAt: Timestamp.fromDate(logDate),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          
          console.log(`✅ Synced CLOSED ${assetName}: Entry $${auditEntryPrice} -> Exit $${matchingFill.price}`);
        }
      }
    }

    await batch.commit();
    return { 
      ok: true, 
      message: `Synced ${posData.openPositions?.length || 0} positions, ${allFills.length} fills, and ${logs.length} account logs.` 
    };

  } catch (err: any) {
    console.error('Kraken Sync Error:', err);
    return { ok: false, message: err.message };
  }
}