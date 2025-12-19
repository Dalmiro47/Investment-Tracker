import crypto from 'crypto';
import { NextResponse } from 'next/server';

const KRAKEN_KEY = process.env.KRAKEN_FUTURES_KEY?.trim();
const KRAKEN_SECRET = process.env.KRAKEN_FUTURES_SECRET?.trim();
const BASE_URL = 'https://futures.kraken.com';

function buildSignature(apiPath: string, nonce: string, queryString: string, secret: string) {
  const signaturePath = apiPath.replace('/derivatives', '');
  const message = queryString + nonce + signaturePath;
  const hash = crypto.createHash('sha256').update(message).digest('binary');
  const secretBuffer = Buffer.from(secret, 'base64');

  return crypto.createHmac('sha512', secretBuffer).update(hash, 'binary').digest('base64');
}

async function krakenRequest(apiPath: string, query: Record<string, string> = {}) {
  if (!KRAKEN_KEY || !KRAKEN_SECRET) {
    throw new Error('Kraken API keys are missing');
  }

  const nonce = Date.now().toString();
  const queryString = new URLSearchParams(query).toString();
  const authent = buildSignature(apiPath, nonce, queryString, KRAKEN_SECRET);
  const url = `${BASE_URL}${apiPath}${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      APIKey: KRAKEN_KEY,
      Authent: authent,
      Nonce: nonce,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  return res.json();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const countParam = searchParams.get('count');
    const query: Record<string, string> = {};
    if (countParam) query.count = countParam;

    const data = await krakenRequest('/api/history/v3/account-log', query);
    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    console.error('Kraken account-log API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Unexpected error calling Kraken account-log' },
      { status: 500 }
    );
  }
}
