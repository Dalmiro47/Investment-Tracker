// app/actions/kraken-sync.ts
'use server';

import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';
import type { FuturePosition } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const KRAKEN_FUTURES_BASE_URL = 'https://futures.kraken.com/derivatives/api/v3';

type KrakenFuturesSyncResult = {
  ok: boolean;
  message: string;
};

type KrakenFill = {
  fill_id: string;
  order_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  timestamp: number;
};

type KrakenCashLog = {
  id: string;
  symbol: string;
  type: string;
  amount: number;
  timestamp: number;
};

type KrakenFillsResponse = { result: string; fills: KrakenFill[]; };
type KrakenCashLogsResponse = { result: string; logs: KrakenCashLog[]; };

// --- Signing Helper ---
function buildKrakenFuturesAuthHeaders(
  apiKey: string,
  apiSecret: string,
  method: 'GET' | 'POST',
  path: string,
  body: string
) {
  const timestamp = Date.now().toString();
  const secret = Buffer.from(apiSecret, 'base64');
  const what = timestamp + method + path + body;
  const hmac = crypto.createHmac('sha512', secret);
  hmac.update(what);
  const signature = hmac.digest('base64');

  return {
    'CF-API-KEY': apiKey,
    'CF-API-SIGN': signature,
    'CF-API-TIMESTAMP': timestamp,
    'Content-Type': 'application/json',
  };
}

async function krakenFuturesFetch<T>(
  apiKey: string,
  apiSecret: string,
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  payload: Record<string, any> = {}
): Promise<T> {
  const path = `/derivatives/api/v3/${endpoint}`;
  const body = method === 'POST' ? JSON.stringify(payload) : '';
  const headers = buildKrakenFuturesAuthHeaders(apiKey, apiSecret, method, path, body);

  const res = await fetch(`${KRAKEN_FUTURES_BASE_URL}/${endpoint}`, {
    method,
    headers,
    body: method === 'POST' ? body : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kraken Futures ${endpoint} failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
}

// --- Logic ---
const futuresCol = (userId: string) => adminDb.collection(`users/${userId}/futures_positions`);

function instrumentToAsset(symbol: string): string {
  const core = symbol.replace(/^pi_/, '').toUpperCase();
  if (core.endsWith('USD')) {
    const base = core.slice(0, -3);
    return `${base}/USD Perp`;
  }
  return `${core} Perp`;
}

// --- Aggregation Logic ---
function aggregateFillsBySymbol(fills: KrakenFill[]) {
  const map = new Map<string, any>();
  for (const f of fills) {
    const acc = map.get(f.symbol) ?? {
      symbol: f.symbol,
      asset: instrumentToAsset(f.symbol),
      netQty: 0,
      vwapEntry: 0,
      collateral: 0,
      size: 0,
      openedAt: f.timestamp,
    };

    const signedQty = f.side === 'buy' ? f.quantity : -f.quantity;
    const prevQty = acc.netQty;
    const newQty = prevQty + signedQty;

    // VWAP Calc
    const notionalBefore = acc.vwapEntry * Math.abs(prevQty);
    const notionalFill = f.price * Math.abs(signedQty);
    const denom = Math.abs(prevQty) + Math.abs(signedQty);
    const vwap = denom > 0 ? (notionalBefore + notionalFill) / denom : acc.vwapEntry;

    acc.netQty = newQty;
    acc.vwapEntry = vwap;
    acc.size += f.quantity * f.price;
    acc.collateral += Math.abs(f.fee ?? 0); // Approx
    acc.openedAt = Math.min(acc.openedAt, f.timestamp);
    map.set(f.symbol, acc);
  }
  return map;
}

function aggregateFundingBySymbol(logs: KrakenCashLog[]) {
  const out = new Map<string, number>();
  for (const l of logs) {
    if (l.type !== 'funding') continue;
    const prev = out.get(l.symbol) ?? 0;
    out.set(l.symbol, prev + l.amount);
  }
  return out;
}

// --- MAIN FUNCTION ---
export async function syncKrakenFutures(userId: string): Promise<KrakenFuturesSyncResult> {
  // SECURITY FIX: Read keys here on the server
  const apiKey = process.env.KRAKEN_FUTURES_KEY;
  const apiSecret = process.env.KRAKEN_FUTURES_SECRET;

  if (!userId) return { ok: false, message: 'User not found.' };
  if (!apiKey || !apiSecret) return { ok: false, message: 'Server missing Kraken API credentials.' };

  try {
    const fillsRes = await krakenFuturesFetch<KrakenFillsResponse>(apiKey, apiSecret, 'fills');
    const logsRes = await krakenFuturesFetch<KrakenCashLogsResponse>(apiKey, apiSecret, 'cash_logs');

    const bySymbol = aggregateFillsBySymbol(fillsRes.fills ?? []);
    const fundingBySymbol = aggregateFundingBySymbol(logsRes.logs ?? []);

    const batch = adminDb.batch();

    // 1. Process Trades
    for (const [symbol, acc] of bySymbol.entries()) {
      const funding = fundingBySymbol.get(symbol) ?? 0;
      const isLong = acc.netQty >= 0;
      const status = acc.netQty === 0 ? 'CLOSED' : 'OPEN';

      const ref = futuresCol(userId).doc(symbol);
      batch.set(ref, {
        asset: acc.asset,
        side: isLong ? 'LONG' : 'SHORT',
        leverage: 0, // API doesn't give leverage directly, defaults to 0
        entryPrice: acc.vwapEntry || 0,
        collateral: acc.collateral,
        size: acc.size,
        accumulatedFunding: FieldValue.increment(funding),
        status,
        openedAt: new Timestamp(Math.floor(acc.openedAt / 1000), 0),
        userId,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    // 2. Process Orphan Funding (funding on closed positions not in recent fills)
    for (const [symbol, funding] of fundingBySymbol.entries()) {
      if (bySymbol.has(symbol)) continue;
      const ref = futuresCol(userId).doc(symbol);
      batch.set(ref, {
        asset: instrumentToAsset(symbol),
        accumulatedFunding: FieldValue.increment(funding),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    await batch.commit();
    return { ok: true, message: 'Kraken Futures positions synced.' };
  } catch (err: any) {
    console.error('[syncKrakenFutures] failed', err);
    return { ok: false, message: err?.message || 'Failed to sync Kraken Futures.' };
  }
}
