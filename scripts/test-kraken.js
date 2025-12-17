import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import process from 'process';

const BASE = 'https://futures.kraken.com/derivatives/api/v3';
const endpoint = 'fills';

function buildHeaders(apiKey, apiSecret, method, path, body, encoding) {
  const ts = Date.now().toString();
  const secret = Buffer.from(apiSecret, encoding);
  const what = ts + method + path + body;
  const hmac = crypto.createHmac('sha512', secret);
  hmac.update(what);
  const sig = hmac.digest('base64');
  return { ts, sig };
}

async function run() {
  // Try to load .env.local if available (for convenience in dev container)
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, 'utf8');
    envText.split(/\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)=([\s\S]*)$/);
      if (m) {
        const key = m[1];
        let val = m[2] || '';
        // Strip surrounding quotes if any
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    });
  }

  const apiKey = process.env.KRAKEN_FUTURES_KEY;
  const apiSecret = process.env.KRAKEN_FUTURES_SECRET;
  if (!apiKey || !apiSecret) {
    console.error('Please set KRAKEN_FUTURES_KEY and KRAKEN_FUTURES_SECRET in environment.');
    process.exit(1);
  }

  // Path completo para fetch (incluye /derivatives)
  const fetchUrl = `${BASE}/${endpoint}`;
  // Path corto para firma (SIN /derivatives, según Kraken docs)
  const signaturePath = `/api/v3/${endpoint}`;
  const body = '';

  // Build signature following Kraken: signature = base64( HMAC-SHA512( path + SHA256(nonce + body), secret(base64-decoded) ) )
  const nonceVariants = [String(Date.now()), String(Math.floor(Date.now() / 1000))];
  const secretBuffer = Buffer.from(apiSecret, 'base64');

  console.log('\n--- Testing Kraken signature (base64 secret decode) with nonce variants ---');
  for (const nonce of nonceVariants) {
    const inner = nonce + body;
    const sha256 = crypto.createHash('sha256').update(inner).digest();
    const pathBuf = Buffer.from(signaturePath, 'utf8');
    const hmacPayload = Buffer.concat([pathBuf, sha256]);
    const signature = crypto.createHmac('sha512', secretBuffer).update(hmacPayload).digest('base64');

    const headers = {
      'APIKey': apiKey,
      'Authent': signature,
      'Nonce': nonce,
      'Content-Type': 'application/json',
    };

    console.log('\nNonce variant:', nonce);
    console.log('Authent (first 16 chars):', signature.slice(0,16) + '...');
    const res = await fetch(fetchUrl, { method: 'GET', headers });
    const text = await res.text();
    console.log('Status:', res.status);
    try { console.log('Body:', JSON.parse(text)); } catch (e) { console.log('Body:', text); }
  }
}

run();
