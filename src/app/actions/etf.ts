
'use server'
import { getPricePointsServer, getFXRatesServer } from '@/lib/firestore.etf.server';
import { simulatePlan } from '@/lib/etf/engine';
import { endOfMonth, startOfMonth, format, parseISO } from 'date-fns';
import { refreshEtfPlanPrices } from './prices';
import type { ETFComponent, ETFPlan, ETFPricePoint } from '@/lib/types.etf';
import type { PlanRow } from '@/lib/etf/engine';

export async function refreshEtfData(uid: string, planId: string, components: ETFComponent[], sinceISO: string) {
  const since = format(startOfMonth(parseISO(sinceISO)), 'yyyy-MM-dd');
  return refreshEtfPlanPrices(uid, planId, components, since);
}
