// scripts/invoke-sync.mjs
// Direct Node.js invocation of syncKrakenFutures Server Action
// This is a test to see if the logs appear in the server console

import { syncKrakenFutures } from '../src/app/actions/kraken-sync.ts';

const testUserId = 'test-user-123';

console.log('Invoking syncKrakenFutures directly...');
console.log('userId:', testUserId);

try {
  const result = await syncKrakenFutures(testUserId);
  console.log('Result:', result);
} catch (error) {
  console.error('Error:', error);
}
