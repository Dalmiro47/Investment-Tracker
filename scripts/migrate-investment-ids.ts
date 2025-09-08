/**
 * Usage:
 *   npx ts-node -P tsconfig.scripts.json scripts/migrate-investment-ids.ts --user=<UID> [--dry-run]
 *   npx ts-node -P tsconfig.scripts.json scripts/migrate-investment-ids.ts --all [--dry-run]
 */

import 'dotenv/config';
import { adminDb } from '@/lib/firebase-admin'; // your existing Admin SDK init
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { buildInvestmentId, toSlug } from '@/lib/ids';

type Flags = { user?: string; all?: boolean; dryRun?: boolean };

function parseFlags(): Flags {
  const args = process.argv.slice(2);
  const flags: Flags = {};
  for (const a of args) {
    if (a.startsWith('--user=')) flags.user = a.split('=')[1];
    if (a === '--all') flags.all = true;
    if (a === '--dry-run') flags.dryRun = true;
  }
  return flags;
}

function shortHash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).slice(0,4);
}

async function copySubcollection(
  src: FirebaseFirestore.DocumentReference,
  dst: FirebaseFirestore.DocumentReference,
  sub: string,
  dryRun: boolean
) {
  const snap = await src.collection(sub).get();
  if (snap.empty) return 0;
  let count = 0;

  // Write in small batches to respect 500 write limit
  let batch = adminDb.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const ref = dst.collection(sub).doc(doc.id);
    if (!dryRun) batch.set(ref, doc.data(), { merge: false });
    count++;
    batchCount++;
    if (batchCount >= 450) { // keep some headroom
      if (!dryRun) await batch.commit();
      batch = adminDb.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0 && !dryRun) await batch.commit();
  return count;
}

async function migrateUser(uid: string, dryRun: boolean) {
  console.log(`\n== Migrating investments for user: ${uid} (dryRun=${dryRun}) ==`);

  const col = adminDb.collection(`users/${uid}/investments`);
  const snap = await col.get();
  if (snap.empty) {
    console.log('  No investments found.');
    return;
  }

  let moved = 0;
  let skipped = 0;
  let txCopied = 0;
  let ratesCopied = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const purchaseDateStr = (data.purchaseDate as Timestamp)?.toDate?.().toISOString() ?? (typeof data.purchaseDate === 'string' ? data.purchaseDate : undefined);
    
    const newBaseId = buildInvestmentId(uid, {
      name: data.name,
      ticker: data.ticker,
      type: data.type,
      purchaseDate: purchaseDateStr,
      createdAt: data.createdAt,
    });

    // Same id already? skip
    if (newBaseId === d.id) {
      skipped++;
      continue;
    }

    // Ensure uniqueness; if exists, append short hash of old id
    let newId = newBaseId;
    const candidateRef = col.doc(newId);
    const candidateSnap = await candidateRef.get();
    if (candidateSnap.exists) {
      newId = `${newBaseId}-${shortHash(d.id)}`;
    }

    const destRef = col.doc(newId);

    console.log(`  ${d.id}  ->  ${newId}`);

    if (!dryRun) {
      // Copy main document (add some helpful fields)
      await destRef.set(
        {
          ...data,
          id: newId,                          // keep id consistent in document if you rely on it
          slug: toSlug(data.ticker || data.name || data.type),
          symbol: data.ticker ?? null,
          oldId: d.id,
          migratedAt: FieldValue.serverTimestamp(),
        },
        { merge: false }
      );
    }

    // Copy subcollections
    txCopied += await copySubcollection(d.ref, destRef, 'transactions', dryRun);
    ratesCopied += await copySubcollection(d.ref, destRef, 'rateSchedule', dryRun);

    // Delete old doc only after successful copy
    if (!dryRun) {
      await d.ref.delete();
    }

    moved++;
  }

  console.log(`\nSummary for ${uid}:`);
  console.log(`  moved:   ${moved}`);
  console.log(`  skipped: ${skipped} (already using new id)`);
  console.log(`  tx docs copied:     ${txCopied}`);
  console.log(`  rateSchedule docs:  ${ratesCopied}`);
}

async function main() {
  const { user, all, dryRun } = parseFlags();
  if (!user && !all) {
    console.error('Pass --user=<UID> or --all');
    process.exit(1);
  }

  if (all) {
    const users = await adminDb.collection('users').listDocuments();
    for (const u of users) {
      await migrateUser(u.id, !!dryRun);
    }
  } else if (user) {
    await migrateUser(user, !!dryRun);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
