/**
 * Shared Kraken Futures API client
 * Used by both API routes and Server Actions to avoid duplicated fetch logic
 */

import crypto from 'crypto';

const KRAKEN_FUTURES_BASE_URL = 'https://futures.kraken.com';

function buildSignature(
  apiPath: string,
  nonce: string,
  queryString: string,
  secret: string
): string {
  // Signature logic: Strips '/derivatives' if present, leaves '/api/history' alone.
  const signaturePath = apiPath.replace('/derivatives', '');
  const message = queryString + nonce + signaturePath;
  const hash = crypto.createHash('sha256').update(message).digest('binary');
  const secretBuffer = Buffer.from(secret, 'base64');

  return crypto
    .createHmac('sha512', secretBuffer)
    .update(hash, 'binary')
    .digest('base64');
}

/**
 * Makes an authenticated request to Kraken Futures API
 * @param apiPath The API endpoint path (e.g., '/derivatives/api/v3/fills')
 * @param params Query parameters as key-value pairs
 * @returns The JSON response from Kraken
 */
export async function krakenRequest<T = any>(
  apiPath: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const apiKey = process.env.KRAKEN_FUTURES_KEY?.trim();
  const apiSecret = process.env.KRAKEN_FUTURES_SECRET?.trim();

  if (!apiKey || !apiSecret) {
    throw new Error('Kraken API credentials are missing');
  }

  const nonce = Date.now().toString();
  
  // Convert all params to strings for URLSearchParams
  const stringParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    stringParams[key] = String(value);
  }
  
  const queryString = new URLSearchParams(stringParams).toString();
  const authent = buildSignature(apiPath, nonce, queryString, apiSecret);
  const url = `${KRAKEN_FUTURES_BASE_URL}${apiPath}${queryString ? `?${queryString}` : ''}`;

  console.log(`📡 Fetching Kraken: ${apiPath}?${queryString}`); // Debug log

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      APIKey: apiKey,
      Authent: authent,
      Nonce: nonce,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(
      `Kraken API Error: ${res.status} ${res.statusText}. Response: ${errorText.substring(0, 200)}`
    );
  }

  return res.json() as Promise<T>;
}

// FIX: Keep using the History API which we know works (preventing 404)
export async function fetchKrakenAccountLog(params: {
  info?: string;
  from?: number;
  continuationToken?: string;
  count?: number;
  sort?: 'asc' | 'desc'; // Add this line
}) {
  return krakenRequest('/api/history/v3/account-log', params as any);
}

export async function fetchKrakenFills(params: {
  lastFillTime?: string;
  count?: number;
}) {
  return krakenRequest('/derivatives/api/v3/fills', params as any);
}
