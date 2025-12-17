// Test script to call syncKrakenFutures Server Action
import { exec } from 'child_process';

const testUserId = 'test-user-123'; // Simulated user ID

// Make a fetch request to the server action
// Note: Server Actions need special handling, typically through form submission
// But we can test by making a direct call to the endpoint if exposed

console.log('Testing syncKrakenFutures Server Action...');
console.log('userId:', testUserId);
console.log('---');

// Since this is a Server Action, we need to invoke it through Next.js
// We can do this by making a POST request to the appropriate endpoint
// or by importing and calling it directly if possible

// Option 1: Make a POST request to trigger the server action
const payload = JSON.stringify({ userId: testUserId });

const curlCommand = `curl -X POST http://localhost:3000/api/sync-kraken \
  -H "Content-Type: application/json" \
  -d '${payload}' \
  2>/dev/null || echo "API endpoint not found, trying direct invocation..."`;

exec(curlCommand, (error, stdout, stderr) => {
  if (error) {
    console.error('Error:', error.message);
  }
  if (stdout) console.log(stdout);
  if (stderr) console.error('stderr:', stderr);
});
