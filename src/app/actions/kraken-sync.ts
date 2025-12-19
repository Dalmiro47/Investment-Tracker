'use server';

import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getDailyEurRate } from '@/lib/providers/frankfurter';
import type { InvestmentType } from '@/lib/types';

const KRAKEN_FUTURES_TRADING_URL = 'https://futures.kraken.com/derivatives/api/v3';
const KRAKEN_FUTURES_HISTORY_URL = 'https://futures.kraken.com/api/history/v3';

// --- Types ---
type KrakenFuturesSyncResult = { ok: boolean; message: string; };

// Account logs contain the PnL and Funding data we need
type KrakenAccountLog = { 
  id: number;
  date: string; 
  asset: string; 
  info: string; 
  booking_uid: string;
  amount: number;
  realized_funding?: number;
  type: string; // 'realized_pnl', 'funding', 'commission', etc.
};

type KrakenLogsResponse = { result: string; logs: KrakenAccountLog[]; };

// Helper: Map Kraken Futures symbols (e.g., kf_ETH) to your App Tickers
function mapKrakenFuturesSymbol(asset: string): { ticker: string; name: string; type: InvestmentType } {
  // Common mapping for Kraken Futures collateral/assets
  if (asset === 'kf_ETH' || asset === 'ETH') return { ticker: 'ETH-PERP', name: 'Ethereum Perpetual', type: 'Future' };
  if (asset === 'kf_XBT' || asset === 'XBT' || asset === 'BTC') return { ticker: 'BTC-PERP', name: 'Bitcoin Perpetual', type: 'Future' };
  if (asset === 'kf_SOL' || asset === 'SOL') return { ticker: 'SOL-PERP', name: 'Solana Perpetual', type: 'Future' };
  // Fallback
  return { ticker: `${asset}-PERP`, name: `${asset} Perpetual`, type: 'Future' };
}

// --- Auth Helper (Unchanged) ---
function buildKrakenFuturesAuthHeaders(apiKey: string, apiSecret: string, endpointPath: string, body: string = '') {
  const nonce = Date.now().toString();
  const secretBuffer = Buffer.from(apiSecret, 'base64');
  const concatenated = (body ?? '') + nonce + endpointPath;
  const sha256Digest = crypto.createHash('sha256').update(concatenated).digest();
  const hmac = crypto.createHmac('sha512', secretBuffer).update(sha256Digest).digest('base64');

  return {
    'APIKey': apiKey,
    'Authent': hmac,
    'Nonce': nonce,
    'Content-Type': 'application/json',
  };
}

async function krakenFuturesFetch<T>(apiKey: string, apiSecret: string, endpoint: string, type: 'trading' | 'history'): Promise<T> {
  let baseUrl = type === 'trading' ? KRAKEN_FUTURES_TRADING_URL : KRAKEN_FUTURES_HISTORY_URL;
  let signaturePath = type === 'trading' ? `/api/v3/${endpoint}` : `/api/history/v3/${endpoint}`;
  
  const headers = buildKrakenFuturesAuthHeaders(apiKey, apiSecret, signaturePath, '');
  
  const res = await fetch(`${baseUrl}/${endpoint}`, { method: 'GET', headers, cache: 'no-store' });
  const text = await res.text();
  
  if (!res.ok) throw new Error(`Kraken Error (${res.status}): ${text}`);
  
  const jsonBody: any = JSON.parse(text);
  if (jsonBody.result === 'error') throw new Error(`Error API: ${JSON.stringify(jsonBody)}`);
  
  return jsonBody as T;
}

export async function syncKrakenFutures(userId: string): Promise<KrakenFuturesSyncResult> {
  const apiKey = process.env.KRAKEN_FUTURES_KEY;
  const apiSecret = process.env.KRAKEN_FUTURES_SECRET;
  if (!userId || !apiKey || !apiSecret) return { ok: false, message: 'Missing credentials' };

  try {
    console.log('--- Fetching Kraken Futures Logs ---');
    // Fetch logs to get Realized PnL, Funding, and Fees
    const logsRes = await krakenFuturesFetch<KrakenLogsResponse>(apiKey, apiSecret, 'account-log', 'history');
    
    const batch = adminDb.batch();
    const investmentsCol = adminDb.collection(`users/${userId}/investments`);

    let processedCount = 0;

    for (const log of (logsRes.logs || [])) {
        // Filter: We only care about events that affect PnL/Tax
        const isTaxEvent = ['realized_pnl', 'funding', 'commission'].includes(log.type) || log.info.includes('funding');
        
        if (!isTaxEvent) continue;

        // 1. Identify Asset
        const { ticker, name, type } = mapKrakenFuturesSymbol(log.asset);
        const investmentId = `FUTURE-${ticker}`; // Consistent ID: FUTURE-ETH-PERP
        
        // 2. Prepare Data
        const amount = log.amount; // Gain/Loss amount in collateral currency
        const date = new Date(log.date); // Kraken sends ISO string in 'date' field

        // 3. Convert to EUR for Tax Report using collateral currency
        const currency = mapKrakenCollateralCurrency(log.asset);
        const eurRate = await getDailyEurRate(date, currency);
        const valueInEur = amount * eurRate;

        // 4. Create References (Use log.id as Firestore doc ID for idempotency)
        const invRef = investmentsCol.doc(investmentId);
        const txRef = invRef.collection('transactions').doc(String(log.id)); // IDEMPOTENCY KEY: log.id

        // 5. Upsert Investment Parent (So it shows up in the portfolio list)
        batch.set(invRef, {
            id: investmentId,
            type: type, // 'Future' - Critical for portfolio.ts logic
            ticker: ticker,
            name: name,
            status: 'Active',
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        // 6. Save Transaction (Granular Data for Tax Report)
        // Use Kraken's log.id as the document ID to prevent duplicates (merge: true)
        batch.set(txRef, {
            krakenId: String(log.id), // Store Kraken ID for audit trail
            id: String(log.id),
            type: 'Sell', 
            date: date.toISOString(),
            quantity: 0, // 0 quantity ensures cost basis is 0, so PnL = totalAmount
            pricePerUnit: 0,
            totalAmount: amount, // The Gain/Loss in original currency
            currency: currency,
            exchangeRate: eurRate,
            valueInEur: valueInEur, // The Taxable Gain/Loss in EUR
            status: 'COMPLETED',
            rawType: log.type, // Store original type for debugging (realiz_pnl, funding, commission)
            rawInfo: log.info,
            metadata: {
              fxSource: 'Frankfurter API',
              rawKrakenType: log.type
            }
        }, { merge: true });

        processedCount++;
    }

    await batch.commit();
    return { ok: true, message: `Synced ${processedCount} PnL events` };

  } catch (err: any) {
    console.error('Sync error:', err);
    return { ok: false, message: err.message };
  }
}