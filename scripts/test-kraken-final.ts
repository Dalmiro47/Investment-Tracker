import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

// Manual load for local script execution
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const KRAKEN_KEY = process.env.KRAKEN_FUTURES_KEY?.trim();
const KRAKEN_SECRET = process.env.KRAKEN_FUTURES_SECRET?.trim();

/**
 * Unified request helper for Kraken Futures.
 * Correctly handles the History API signature requirements.
 */
async function krakenRequest(apiPath: string, query: Record<string, any> = {}) {
  if (!KRAKEN_KEY || !KRAKEN_SECRET) {
    throw new Error('❌ API Keys not found in .env.local');
  }

  // Nonce must be a unique, increasing integer (milliseconds is standard)
  const nonce = Date.now().toString();
  const queryString = new URLSearchParams(query).toString();
  
  // Signature path: Must strip /derivatives if present
  const signaturePath = apiPath.replace('/derivatives', '');
  
  // Message format: query + nonce + path
  const message = queryString + nonce + signaturePath;
  
  // 1. SHA256 of the message
  const hash = crypto.createHash('sha256').update(message).digest('binary');
  
  // 2. HMAC-SHA512 with the base64-decoded secret
  const secretBuffer = Buffer.from(KRAKEN_SECRET, 'base64');
  const authent = crypto
    .createHmac('sha512', secretBuffer)
    .update(hash, 'binary')
    .digest('base64');

  const url = `https://futures.kraken.com${apiPath}${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'APIKey': KRAKEN_KEY,
      'Authent': authent,
      'Nonce': nonce,
      'Accept': 'application/json'
    }
  });

  return res.json();
}

async function runTests() {
  console.log("🚀 Starting Kraken Futures API Tests...");

  // 1. Test Open Positions
  try {
    const data = await krakenRequest('/derivatives/api/v3/openpositions');
    console.log("\n--- Testing: /derivatives/api/v3/openpositions ---");
    if (data.result === 'success') {
      console.log(`✅ Success! Found ${data.openPositions?.length || 0} positions.`);
    } else {
      console.error("❌ Failed. Full Response:", JSON.stringify(data));
    }
  } catch (e) { console.error("💥 Error:", e); }

  // 2. Test Fills
  try {
    const data = await krakenRequest('/derivatives/api/v3/fills', { count: 1 });
    console.log("\n--- Testing: /derivatives/api/v3/fills ---");
    if (data.result === 'success') {
      console.log(`✅ Success! Found ${data.fills?.length || 0} fills.`);
    } else {
      console.error("❌ Failed. Full Response:", JSON.stringify(data));
    }
  } catch (e) { console.error("💥 Error:", e); }

  // 3. Test Account Log (The missing piece for German Taxes)
  try {
    console.log("\n--- Testing: /api/history/v3/account-log ---");
    // Added 'count' to the query to match the documentation example
    const data = await krakenRequest('/api/history/v3/account-log', { count: 5 });
    
    if (data.result === 'success' && data.logs) {
      console.log(`✅ Success! Found ${data.logs.length} ledger entries.`);
      
      // Log the first entry to verify we have the PnL/Fee/Funding fields
      if (data.logs.length > 0) {
        console.log("Sample Log Entry:", {
          date: data.logs[0].date,
          info: data.logs[0].info,
          asset: data.logs[0].asset,
          realized_pnl: data.logs[0].realized_pnl,
          fee: data.logs[0].fee
        });
      }
    } else {
      // Improved error logging to see the 'result' and 'message' fields
      console.error("❌ Failed. Full Response:", JSON.stringify(data));
    }
  } catch (e) { console.error("💥 Error:", e); }
}

runTests();