import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { syncKrakenFutures } from '../src/app/actions/kraken-sync';

async function testSync() {
  console.log('Testing Kraken Sync Action...\n');
  
  // Replace with your actual Firebase user ID
  const userId = process.env.TEST_USER_ID || 'test-user-id';
  
  console.log(`Syncing for user: ${userId}\n`);
  
  try {
    const result = await syncKrakenFutures(userId);
    console.log('\n=== SYNC RESULT ===');
    console.log('Success:', result.ok);
    console.log('Message:', result.message);
  } catch (err: any) {
    console.error('Sync failed:', err.message);
  }
}

testSync();
