
'use server'
import { getPricePointsServer, getFXRatesServer } from '@/lib/firestore.etf.server';
import { simulatePlan } from '@/lib/etf/engine';
import { endOfMonth, startOfMonth, format, parseISO } from 'date-fns';
import { refreshEtfPlanPrices } from './prices';
import type { ETFComponent, ETFPlan, ETFPricePoint } from '@/lib/types.etf';
import type { PlanRow } from '@/lib/etf/engine';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getEtfPlans } from '@/lib/firestore.etfPlan';

export async function refreshEtfData(uid: string, planId: string, components: ETFComponent[], sinceISO: string) {
  const since = format(startOfMonth(parseISO(sinceISO)), 'yyyy-MM-dd');
  return refreshEtfPlanPrices(uid, planId, components, since);
}


type EtfHistoryResult = {
  success: boolean;
  message: string;
  skippedReason?: 'not_due' | 'rate_limited';
  nextDueAt?: string; // ISO
  updatedCount?: number;
};

function monthKeyUTC(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}

const MIN_COOLDOWN_MS = 10 * 60 * 1000; // defensive: avoid spamming if user reloads

async function doRefreshEtfHistory(userId: string): Promise<number> {
    const plans = await getEtfPlans(userId);
    if (plans.length === 0) return 0;
    
    // Use the earliest start date of all plans as the 'since' date for a full history refresh
    const sinceISO = plans.map(p => p.startDate).sort()[0];
    const since = format(startOfMonth(parseISO(sinceISO)), 'yyyy-MM-dd');
    
    // Collect all unique components from all plans
    const allComponents: ETFComponent[] = [];
    const seenTickers = new Set<string>();
    
    for (const plan of plans) {
        const planDetails = await getEtfPlan(userId, plan.id);
        if(planDetails) {
            for (const comp of planDetails.components) {
                if (comp.ticker && !seenTickers.has(comp.ticker)) {
                    allComponents.push(comp);
                    seenTickers.add(comp.ticker);
                }
            }
        }
    }

    if (allComponents.length === 0) return 0;

    // Refresh all prices in one go. Assume this writes to a global-enough location
    // that all plans can use the data (e.g., users/{uid}/prices/{ticker}/...).
    // The current `refreshEtfPlanPrices` writes per planId, so we will call it for each plan
    // but the underlying price fetch can be optimized if needed later.
    let totalUpdated = 0;
    for (const plan of plans) {
        const planDetails = await getEtfPlan(userId, plan.id);
        if(planDetails && planDetails.components.length > 0) {
           const result = await refreshEtfPlanPrices(userId, plan.id, planDetails.components, since);
           if(result.ok) {
                totalUpdated += planDetails.components.length;
           }
        }
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

  // Skip if we already refreshed this calendar month and not forced
  if (!forced && lastMonthKey === currentMonth) {
    // Next due at first day of next month 00:00 UTC
    const nextDue = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth()+1, 1));
    return { success: false, message: 'Already refreshed for this month.', skippedReason: 'not_due', nextDueAt: nextDue.toISOString() };
  }

  // Defensive minimal debounce (covers repeated opens on day 1)
  if (!forced && now - lastRefreshAt < MIN_COOLDOWN_MS) {
    const next = new Date(lastRefreshAt + MIN_COOLDOWN_MS).toISOString();
    return { success: false, message: 'Try again later.', skippedReason: 'rate_limited', nextDueAt: next };
  }

  // Mark start
  await metaRef.set(
    { lastRefreshAt: FieldValue.serverTimestamp(), lastMonthKey: currentMonth },
    { merge: true }
  );

  const updatedCount = await doRefreshEtfHistory(userId);

  await metaRef.set(
    {
      lastRefreshCompletedAt: FieldValue.serverTimestamp(),
      lastMonthKey: currentMonth,
      updatedCount,
    },
    { merge: true }
  );

  return { success: true, message: `ETF history refreshed for ${currentMonth}.`, updatedCount };
}
