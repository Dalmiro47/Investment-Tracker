
'use server'
import { getPricePoints, getFXRates } from '@/lib/firestore.etf';
import { simulatePlan } from '@/lib/etf/engine';
import type { ETFPlan, ETFComponent } from '@/lib/types.etf';
import { endOfMonth, format } from 'date-fns';

export async function runEtfSimulation(uid: string, plan: ETFPlan, components: ETFComponent[]) {
  const start = plan.startDate;
  const end = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  // fetch all time-series for each component
  const perSymbol: Record<string, any> = {};
  await Promise.all(components.map(async c => {
    const symbol = c.ticker ?? c.isin;
    perSymbol[symbol] = await getPricePoints(uid, plan.id, symbol, start, end);
  }));

  const fx = await getFXRates(uid, start, end);

  return simulatePlan(plan, components, perSymbol, fx);
}
