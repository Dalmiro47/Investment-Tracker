'use server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getEtfPlans, getEtfPlan } from '@/lib/firestore.etfPlan';

type EtfHistoryResult = {
  success: boolean;
  message: string;
  skippedReason?: 'not_due' | 'rate_limited';
  nextDueAt?: string;
  updatedCount?: number;
};

function monthKeyUTC(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MIN_COOLDOWN_MS = 10 * 60 * 1000; // 10 min

async function doRefreshEtfHistory(userId: string): Promise<number> {
  const plans = await getEtfPlans(userId);
  if (!plans.length) return 0;

  const sinceISO = plans.map(p => p.startDate).sort()[0];

  let totalUpdated = 0;
  for (const p of plans) {
    const plan = await getEtfPlan(userId, p.id);
    if (!plan || !plan.components?.length) continue;

    const res = await (await import('./prices'))
      .refreshEtfPlanPrices(userId, plan.id, plan.components, sinceISO);
    if (res?.ok) totalUpdated += plan.components.length;
  }
  return totalUpdated;
}

export async function refreshEtfHistoryForMonth(
  userId: string,
  opts?: { forced?: boolean }
): Promise<EtfHistoryResult> {
  const forced = !!opts?.forced;
  if (!userId) return { success: false, message: 'User not found.' };

  const metaRef = adminDb.doc(`users/${userId}/meta/etfPricing`);
  const snap = await metaRef.get();

  const now = Date.now();
  const currentMonth = monthKeyUTC();
  const lastMonthKey = snap.get('lastMonthKey') as string | undefined;
  const lastRefreshAt = (snap.get('lastRefreshAt') as Timestamp | undefined)?.toMillis?.() ?? 0;

  if (!forced && lastMonthKey === currentMonth) {
    const nextDue = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
    return { success: false, message: 'Already refreshed for this month.', skippedReason: 'not_due', nextDueAt: nextDue.toISOString() };
  }

  if (!forced && now - lastRefreshAt < MIN_COOLDOWN_MS) {
    const next = new Date(lastRefreshAt + MIN_COOLDOWN_MS).toISOString();
    return { success: false, message: 'Try again later.', skippedReason: 'rate_limited', nextDueAt: next };
  }

  await metaRef.set({ lastRefreshAt: FieldValue.serverTimestamp(), lastMonthKey: currentMonth }, { merge: true });

  const updatedCount = await doRefreshEtfHistory(userId);

  await metaRef.set(
    { lastRefreshCompletedAt: FieldValue.serverTimestamp(), lastMonthKey: currentMonth, updatedCount },
    { merge: true }
  );

  return { success: true, message: `ETF history refreshed for ${currentMonth}.`, updatedCount };
}
