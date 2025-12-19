import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

// Manually point to .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testPath(pathArg: string) {
  const KRAKEN_KEY = process.env.KRAKEN_FUTURES_KEY?.trim();
  const KRAKEN_SECRET = process.env.KRAKEN_FUTURES_SECRET?.trim();
  
  if (!KRAKEN_KEY || !KRAKEN_SECRET) {
    console.error('Error: KRAKEN_FUTURES_KEY or KRAKEN_FUTURES_SECRET not found in environment');
    return;
  }
  
  const NONCE = Date.now().toString();

  // Fixed: Use binary encoding for SHA-256 hash
  const signaturePath = pathArg.replace('/derivatives', '');
  const message = "" + NONCE + signaturePath;
  const hash = crypto.createHash('sha256').update(message).digest('binary');
  const secretBuffer = Buffer.from(KRAKEN_SECRET, 'base64');
  const authent = crypto.createHmac('sha512', secretBuffer).update(hash, 'binary').digest('base64');

  console.log(`\nTesting path: ${pathArg}`);
  console.log(`Signature path: ${signaturePath}`);
  console.log(`API Key (first 10 chars): ${KRAKEN_KEY.substring(0, 10)}...`);
  
  const res = await fetch(`https://futures.kraken.com${pathArg}`, {
    headers: { 'APIKey': KRAKEN_KEY, 'Authent': authent, 'Nonce': NONCE }
  });
  
  const text = await res.text();
  console.log(`Response status: ${res.status}`);
  
  try {
    const data = JSON.parse(text);
    console.log(`Result:`, data.result, data.error || '');
    if (data.result === 'success') {
      console.log('Success! Data preview:', JSON.stringify(data, null, 2).substring(0, 500));
    }
  } catch (e) {
    console.log('Response is not JSON. First 200 chars:', text.substring(0, 200));
  }
}

// Run both common variations
(async () => {
  await testPath('/derivatives/api/v3/openpositions');
  await testPath('/api/v3/openpositions');
})();
