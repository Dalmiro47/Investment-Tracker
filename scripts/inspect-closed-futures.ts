import { adminDb } from '@/lib/firebase-admin';

/**
 * Debug script: Inspect all CLOSED futures positions in Firestore
 * Shows current side values and other details
 */
async function inspectClosedFutures(userId: string) {
  if (!userId) {
    console.error('❌ Usage: npx ts-node scripts/inspect-closed-futures.ts <userId>');
    process.exit(1);
  }

  try {
    const positionsCol = adminDb.collection('users').doc(userId).collection('futures_positions');
    
    // Query all CLOSED positions
    const closedDocs = await positionsCol.where('status', '==', 'CLOSED').get();
    
    console.log(`\n📋 Found ${closedDocs.size} CLOSED positions:\n`);
    
    closedDocs.forEach((doc) => {
      const data = doc.data();
      console.log(`${doc.id}`);
      console.log(`  Asset:     ${data.asset} (${data.ticker})`);
      console.log(`  Side:      ${data.side || 'MISSING'}`);
      console.log(`  Size:      ${data.size || 'MISSING'}`);
      console.log(`  Entry:     $${data.entryPrice || 'MISSING'}`);
      console.log(`  Exit:      $${data.exitPrice || 'MISSING'}`);
      console.log(`  Realized:  €${data.realizedPnlEur || 0}`);
      console.log(`  Fee:       €${data.feeEur || 0}`);
      console.log(`  Closed At: ${data.closedAt?.toDate?.() || 'MISSING'}`);
      console.log(`  Booking UID: ${data.booking_uid}`);
      console.log();
    });

    if (closedDocs.size === 0) {
      console.log('✅ No CLOSED positions found (clean state)\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Get userId from command line argument
const userId = process.argv[2];
inspectClosedFutures(userId);
