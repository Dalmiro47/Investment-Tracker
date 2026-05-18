/**
 * One-off Firestore export script.
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/export-firestore.ts \
 *       <collectionPath> [--where=field==value] [--out=path.json]
 *
 * Examples:
 *   npx ts-node --project tsconfig.scripts.json scripts/export-firestore.ts \
 *       users/<uid>/futures_positions
 *
 *   npx ts-node --project tsconfig.scripts.json scripts/export-firestore.ts \
 *       users/<uid>/futures_positions --where=status==CLOSED
 *
 *   npx ts-node --project tsconfig.scripts.json scripts/export-firestore.ts \
 *       users/<uid>/kraken_logs --out=kraken_logs.json
 *
 * Reads env from .env.local automatically.
 */

import 'dotenv/config';
import { config as dotenvConfig } from 'dotenv';
import { resolve as pathResolve, join as pathJoin } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

// Load .env.local explicitly (dotenv/config above only picks up .env)
dotenvConfig({ path: pathResolve(process.cwd(), '.env.local') });

// Import AFTER env is loaded — firebase-admin reads creds on first import
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp, GeoPoint, DocumentReference } from 'firebase-admin/firestore';

const PAGE_SIZE = 500;

type WhereClause = { field: string; op: FirebaseFirestore.WhereFilterOp; value: string | number | boolean };

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, ...rest] = a.slice(2).split('=');
      flags[k] = rest.join('=');
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function parseWhere(raw: string | undefined): WhereClause | null {
  if (!raw) return null;
  // Support ==, !=, >=, <=, >, < (longest first so == doesn't shadow =)
  const ops: FirebaseFirestore.WhereFilterOp[] = ['==', '!=', '>=', '<='];
  for (const op of ops) {
    const idx = raw.indexOf(op);
    if (idx !== -1) {
      const field = raw.slice(0, idx).trim();
      const rawVal = raw.slice(idx + op.length).trim();
      return { field, op, value: coerce(rawVal) };
    }
  }
  for (const op of ['>', '<'] as const) {
    const idx = raw.indexOf(op);
    if (idx !== -1) {
      const field = raw.slice(0, idx).trim();
      const rawVal = raw.slice(idx + 1).trim();
      return { field, op, value: coerce(rawVal) };
    }
  }
  throw new Error(`Invalid --where expression: "${raw}". Use field==value, field>value, etc.`);
}

function coerce(raw: string): string | number | boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
  return raw;
}

/**
 * Recursively convert Firestore-specific types to plain JSON-friendly values.
 */
function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof GeoPoint) return { _lat: value.latitude, _lng: value.longitude };
  if (value instanceof DocumentReference) return `ref:${value.path}`;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalize(v);
    }
    return out;
  }
  return value;
}

async function exportCollection(path: string, where: WhereClause | null) {
  const segs = path.split('/').filter(Boolean);
  if (segs.length === 0 || segs.length % 2 === 0) {
    throw new Error(`Path must point to a collection (odd number of segments). Got: "${path}"`);
  }

  let q: FirebaseFirestore.Query = adminDb.collection(path);
  if (where) q = q.where(where.field, where.op, where.value);

  const docs: Array<Record<string, unknown>> = [];
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let pageQ = q.limit(PAGE_SIZE);
    if (last) pageQ = pageQ.startAfter(last);
    const snap = await pageQ.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      docs.push({ _id: doc.id, ...(normalize(doc.data()) as Record<string, unknown>) });
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  return docs;
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const path = (positional[0] ?? '').trim();

  if (!path || path.includes('<') || path.includes('>')) {
    console.error('Usage: export-firestore.ts <collectionPath> [--where=field==value] [--out=path.json]');
    console.error('Example: export-firestore.ts users/abc123/futures_positions --where=status==CLOSED');
    if (path.includes('<') || path.includes('>')) {
      console.error(`\nGot path "${path}" — replace placeholders like <YOUR_UID> with your actual UID (no angle brackets).`);
    }
    process.exit(1);
  }

  const where = parseWhere(flags.where);

  console.log(`📤 Exporting ${path}${where ? ` where ${where.field} ${where.op} ${JSON.stringify(where.value)}` : ''}...`);
  const docs = await exportCollection(path, where);
  console.log(`   Read ${docs.length} documents.`);

  const outDir = pathResolve(process.cwd(), 'scripts/exports');
  mkdirSync(outDir, { recursive: true });

  const safeName = path.replace(/\//g, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = flags.out
    ? pathResolve(process.cwd(), flags.out)
    : pathJoin(outDir, `${safeName}-${stamp}.json`);

  writeFileSync(outPath, JSON.stringify(docs, null, 2), 'utf8');
  console.log(`✅ Wrote ${outPath}`);
}

main().catch((err) => {
  console.error('❌ Export failed:', err);
  process.exit(1);
});
