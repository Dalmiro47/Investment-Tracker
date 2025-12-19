// scripts/verify-sync-flow.ts

/**
 * Use Copilot to auto-import:
 * - axios or fetch
 */

async function runHealthCheck() {
  const LOCAL_BASE_URL = 'http://localhost:3000';
  console.log('🔍 Checking API Flow: Script -> Next.js -> Kraken -> Firestore\n');

  const endpoints = [
    { name: 'Open Positions', path: '/api/kraken/open-positions' }, // Assuming you have this route
    { name: 'Trade Fills', path: '/api/kraken/fills' }, // Assuming you have this route
    { name: 'Account Log (Tax Data)', path: '/api/kraken/account-log' },
  ];

  for (const api of endpoints) {
    try {
      console.log(`📡 Testing ${api.name}...`);
      const response = await fetch(`${LOCAL_BASE_URL}${api.path}`);

      if (response.ok) {
        const data = await response.json();
        const count = data.logs?.length || data.fills?.length || data.openPositions?.length || 0;
        console.log(`✅ ${api.name} Working! Received ${count} items.\n`);
      } else {
        const error = await response.text();
        console.error(`❌ ${api.name} Failed: ${response.status} - ${error}\n`);
      }
    } catch (e) {
      console.error(`💥 Could not connect to local server for ${api.name}. Is your Next.js app running?`);
    }
  }
}

runHealthCheck();
