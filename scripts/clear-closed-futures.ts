import { adminDb } from '@/lib/firebase-admin';

/**
 * Clear all CLOSED futures positions from Firestore
 * Run this before syncing to ensure fresh data with correct side derivation
 */
async function clearClosedFutures(userId: string) {
  if (!userId) {
    console.error('❌ Usage: npx ts-node scripts/clear-closed-futures.ts <userId>');
    process.exit(1);
  }

  try {
    const positionsCol = adminDb.collection('users').doc(userId).collection('futures_positions');
    
    // Query all CLOSED positions
    const closedDocs = await positionsCol.where('status', '==', 'CLOSED').get();
    
    console.log(`🗑️  Found ${closedDocs.size} CLOSED positions to delete...`);
    
    const batch = adminDb.batch();
    let count = 0;
    
    closedDocs.forEach((doc) => {
      console.log(`   Deleting: ${doc.id} (${doc.data().asset})`);
      batch.delete(doc.ref);
      count++;
    });
    
    await batch.commit();
    console.log(`✅ Deleted ${count} CLOSED positions. Run syncKrakenFutures again to re-sync with corrected side values.`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Get userId from command line argument
const userId = process.argv[2];
clearClosedFutures(userId);
