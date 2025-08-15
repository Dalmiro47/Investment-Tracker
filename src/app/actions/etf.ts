'use server'
import { getPricePointsServer, getFXRatesServer } from '@/lib/firestore.etf.server';
import { simulatePlan } from '@/lib/etf/engine';
import { endOfMonth, startOfMonth, format, parseISO } from 'date-fns';
import { refreshEtfPlanPrices } from './prices';
import type { ETFComponent, ETFPlan } from '@/lib/types.etf';

export async function refreshEtfData(uid: string, planId: string, components: ETFComponent[], sinceISO: string) {
  const since = format(startOfMonth(parseISO(sinceISO)), 'yyyy-MM-dd');
  return refreshEtfPlanPrices(uid, planId, components, since);
}

export async function runPlan(uid: string, plan: ETFPlan, components: ETFComponent[]) {
  try {
    const start = format(startOfMonth(parseISO(plan.startDate)), 'yyyy-MM-dd');
    const end   = format(endOfMonth(new Date()), 'yyyy-MM-dd');

    const perSymbol: Record<string, any> = {};
    await Promise.all(components.map(async c => {
      const symbol = c.ticker ?? c.isin;
      if (symbol) {
        perSymbol[symbol] = await getPricePointsServer(uid, plan.id, symbol, start, end);
      }
    }));
    const fx = await getFXRatesServer(uid, start, end);
    return simulatePlan(plan, components, perSymbol, fx);
  } catch (e:any) {
    // surface errors to the UI
    throw new Error(`runPlan failed: ${e.message ?? e}`);
  }
}
