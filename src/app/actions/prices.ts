'use server'
import { cachePricesServer, cacheFXServer } from '@/lib/firestore.etf.server';
import { fetchYahooMonthly } from '@/lib/providers/yahoo';
import { fetchECBMonthlyEUR } from '@/lib/providers/ecb';
import { defaultTickerForISIN } from '@/lib/providers/yahoo';
import type { ETFComponent, ETFPricePoint } from '@/lib/types.etf';

export async function refreshEtfPlanPrices(uid: string, planId: string, components: ETFComponent[], since: string) {
  try {
    const items = components.map(c => ({ ...c, symbol: c.ticker || defaultTickerForISIN(c.isin, c.preferredExchange) }))
                            .filter(c => c.symbol);
    const monthlyBySymbol: Record<string, ETFPricePoint[]> = {};
    await Promise.all(items.map(async c => { if (c.symbol) monthlyBySymbol[c.symbol] = await fetchYahooMonthly(c.symbol, since); }));
    const fx = await fetchECBMonthlyEUR(since);
    await cachePricesServer(uid, planId, monthlyBySymbol);
    await cacheFXServer(uid, fx);
    return { ok: true, message: "Price data refreshed successfully." };
  } catch (e:any) { return { ok:false, error: e.message ?? 'Failed' }; }
}
