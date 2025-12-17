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
  
  // For GET requests, body is empty string.
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
  method: 'GET' | 'POST' = 'GET', // Changed default to GET
  payload: Record<string, any> = {}
): Promise<T> {
  const path = `/derivatives/api/v3/${endpoint}`;
  
  // Historical endpoints often use query params for GET, 
  // but for a simple "fetch all", we send an empty body string for the signature.
  const body = method === 'POST' ? JSON.stringify(payload) : '';
  
  const headers = buildKrakenFuturesAuthHeaders(apiKey, apiSecret, method, path, body);

  const res = await fetch(`${KRAKEN_FUTURES_BASE_URL}/${endpoint}`, {
    method,
    headers,
    // Body must be undefined for GET requests
    body: method === 'POST' ? body : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kraken Futures ${endpoint} failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
}
