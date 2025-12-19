import crypto from 'crypto';

async function testPath(path: string) {
  const KRAKEN_KEY = "YOUR_PUBLIC_KEY".trim();
  const KRAKEN_SECRET = "YOUR_SECRET_KEY".trim();
  const NONCE = Date.now().toString();

  // Fixed: Use binary encoding for SHA-256 hash
  const signaturePath = path.replace('/derivatives', '');
  const message = "" + NONCE + signaturePath;
  const hash = crypto.createHash('sha256').update(message).digest('binary');
  const secretBuffer = Buffer.from(KRAKEN_SECRET, 'base64');
  const authent = crypto.createHmac('sha512', secretBuffer).update(hash, 'binary').digest('base64');

  const res = await fetch(`https://futures.kraken.com${path}`, {
    headers: { 'APIKey': KRAKEN_KEY, 'Authent': authent, 'Nonce': NONCE }
  });
  const data = await res.json();
  console.log(`Path [${path}] Result:`, data.result, data.error || '');
  if (data.result === 'success') {
    console.log('Success! Data:', JSON.stringify(data, null, 2).substring(0, 500));
  }
}

// Run both common variations
testPath('/derivatives/api/v3/openpositions');
testPath('/api/v3/openpositions');