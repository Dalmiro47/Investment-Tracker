import crypto from 'crypto';

const KRAKEN_SECRET = "YOUR_FUTURES_SECRET"; // Or use process.env
const KRAKEN_KEY = "YOUR_FUTURES_KEY";
const PATH = '/derivatives/api/v3/openpositions';
const NONCE = Date.now().toString();

// The "Heavy Lifting" Signature logic we want to verify
const message = "" + NONCE + PATH;
const hash = crypto.createHash('sha256').update(message).digest();
const secretBuffer = Buffer.from(KRAKEN_SECRET, 'base64');
const authent = crypto.createHmac('sha512', secretBuffer).update(hash).digest('base64');

async function test() {
  const res = await fetch(`https://futures.kraken.com${PATH}`, {
    headers: { 'APIKey': KRAKEN_KEY, 'Authent': authent, 'Nonce': NONCE }
  });
  const data = await res.json();
  console.log('Kraken Test Result:', JSON.stringify(data, null, 2));
}

test();