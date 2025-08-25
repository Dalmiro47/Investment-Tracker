
// src/lib/firestore.etf.server.ts  (server-only)
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp, WriteBatch, FieldPath } from 'firebase-admin/firestore';
import type { ETFPricePoint, FXRatePoint } from './types.etf';
import { endOfMonth, parseISO } from 'date-fns';

async function commitInChunks<T>(items: T[], writeFn: (batch: WriteBatch, item: T) => void) {
  if (!items.length) return;
  let batch = adminDb.batch();
  let count = 0;
  for (const item of items) {
    writeFn(batch, item as any);
    if (++count === 499) { await batch.commit(); batch = adminDb.batch(); count = 0; }
  }
  if (count) await batch.commit();
}

export async function cachePricesServer(uid: string, planId: string, monthlyBySymbol: Record<string, ETFPricePoint[]>) {
    const all = Object.entries(monthlyBySymbol).flatMap(([symbol, points]) => points.map(p => ({ symbol, ...p })));
    await commitInChunks(all, (batch, p) => {
        const monthEnd = endOfMonth(parseISO(p.date));
        const monthId = monthEnd.toISOString().slice(0, 7);
        const ref = adminDb.doc(`users/${uid}/etfPlans/${planId}/prices/${p.symbol}/points/${monthId}`);
        batch.set(ref, { ...p, date: Timestamp.fromDate(monthEnd) });
    });
}


export async function cacheFXServer(uid: string, points: FXRatePoint[]) {
  await commitInChunks(points, (batch, p) => {
    const monthEnd = endOfMonth(parseISO(p.date));
    const monthId = monthEnd.toISOString().slice(0, 7);
    const ref = adminDb.doc(`users/${uid}/fx_rates/${monthId}`);
    batch.set(ref, { ...p, date: Timestamp.fromDate(monthEnd) });
  });
}

export async function getFXRatesServer(uid: string, startISO: string, endISO: string): Promise<Record<string, FXRatePoint>> {
  const startMonth = startISO.slice(0, 7);
  const endMonth   = endISO.slice(0, 7);
  
  const snap = await adminDb
    .collection(`users/${uid}/fx_rates`)
    .orderBy(FieldPath.documentId())
    .startAt(startMonth)
    .endAt(endMonth)
    .get();

  const out: Record<string, FXRatePoint> = {};
  snap.forEach(d => {
    const data = d.data() as any;
    const month = d.id;
    out[month] = { date: `${month}-01`, month, base: 'EUR', rates: data.rates };
  });
  return out;
}

async function readOverrides(uid: string, planId: string, symbol: string, startMonth: string, endMonth: string) {
    const snap = await adminDb
        .collection(`users/${uid}/etfPlans/${planId}/prices/${symbol}/overrides`)
        .orderBy(FieldPath.documentId())
        .startAt(startMonth)
        .endAt(endMonth)
        .get();

    const out: Record<string, ETFPricePoint> = {};
    snap.forEach(d => {
        const data = d.data() as any;
        const month = d.id;
        out[month] = {
            symbol: symbol,
            date: `${month}-01`,
            month,
            close: data.close,
            currency: data.currency,
            source: 'manual',
            note: data.note,
        };
    });
    return out;
}

export async function getPricePointsServer(uid: string, planId: string, symbol: string, startISO: string, endISO: string) {
  const startMonth = startISO.slice(0, 7);
  const endMonth = endISO.slice(0, 7);
  
  const snap = await adminDb
    .collection(`users/${uid}/etfPlans/${planId}/prices/${symbol}/points`)
    .orderBy(FieldPath.documentId())
    .startAt(startMonth)
    .endAt(endMonth)
    .get();

  const base: Record<string, ETFPricePoint> = {};
  snap.forEach(d => {
    const data = d.data() as any;
    const month = d.id;
    base[month] = {
      symbol: data.symbol,
      date: `${month}-01`,
      month,
      close: data.close,
      currency: data.currency
    };
  });
  
  const overrides = await readOverrides(uid, planId, symbol, startMonth, endMonth);
  
  // Merge overrides, with overrides taking precedence
  for (const [month, overridePoint] of Object.entries(overrides)) {
    base[month] = { ...base[month], ...overridePoint };
  }
  
  return base;
}
