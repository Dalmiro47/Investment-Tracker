
// src/lib/firestore.etf.server.ts  (server-only)
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp, WriteBatch } from 'firebase-admin/firestore';
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
  const snap = await adminDb
    .collection(`users/${uid}/fx_rates`)
    .where('date', '>=', Timestamp.fromDate(new Date(startISO)))
    .where('date', '<=', Timestamp.fromDate(new Date(endISO)))
    .get();

  const out: Record<string, FXRatePoint> = {};
  snap.forEach(d => {
    const data = d.data() as any;
    const dt = (data.date as Timestamp).toDate();
    const month = dt.toISOString().slice(0,7);
    out[month] = { date: dt.toISOString().slice(0,10), month, base: 'EUR', rates: data.rates };
  });
  return out;
}

export async function getPricePointsServer(uid: string, planId: string, symbol: string, startISO: string, endISO: string) {
  const snap = await adminDb
    .collection(`users/${uid}/etfPlans/${planId}/prices/${symbol}/points`)
    .where('date', '>=', Timestamp.fromDate(new Date(startISO)))
    .where('date', '<=', Timestamp.fromDate(new Date(endISO)))
    .get();

  const out: Record<string, ETFPricePoint> = {};
  snap.forEach(d => {
    const data = d.data() as any;
    const dt = (data.date as Timestamp).toDate();
    const month = dt.toISOString().slice(0,7);
    out[month] = { symbol: data.symbol, date: dt.toISOString().slice(0,10), month, close: data.close, currency: data.currency };
  });
  return out;
}
