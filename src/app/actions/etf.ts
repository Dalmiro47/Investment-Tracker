'use server'
import { getPricePointsServer, getFXRatesServer } from '@/lib/firestore.etf.server';
import { simulatePlan } from '@/lib/etf/engine';
import { endOfMonth, startOfMonth, format, parseISO } from 'date-fns';
import { refreshEtfPlanPrices } from './prices';
import type { ETFComponent, ETFPlan, ETFPricePoint } from '@/lib/types.etf';

export async function refreshEtfData(uid: string, planId: string, components: ETFComponent[], sinceISO: string) {
  const since = format(startOfMonth(parseISO(sinceISO)), 'yyyy-MM-dd');
  return refreshEtfPlanPrices(uid, planId, components, since);
}

export async function runPlan(uid: string, plan: ETFPlan, components: ETFComponent[]) {
  try {
    const start = format(startOfMonth(parseISO(plan.startDate)), 'yyyy-MM-dd');
    const end   = format(endOfMonth(new Date()), 'yyyy-MM-dd');

    const perSymbol: Record<string, Record<string, ETFPricePoint>> = {};
    const allCurrencies = new Set<string>();

    await Promise.all(components.map(async c => {
      const symbol = c.ticker;
      if (symbol) {
        const points = await getPricePointsServer(uid, plan.id, symbol, start, end);
        perSymbol[symbol] = points;
        // Collect all unique currencies from the fetched price points
        Object.values(points).forEach(p => allCurrencies.add(p.currency));
      }
    }));
    
    // Only fetch FX rates if there's more than one currency or the single currency is not EUR
    const needsFx = allCurrencies.size > 1 || (allCurrencies.size === 1 && !allCurrencies.has('EUR'));
    const fx = needsFx ? await getFXRatesServer(uid, start, end) : {};
    
    return simulatePlan(plan, components, perSymbol, fx);
  } catch (e:any) {
    console.error('runPlan failed:', e);
    // surface errors to the UI
    throw new Error(`runPlan failed: ${e.message ?? e}`);
  }
}
