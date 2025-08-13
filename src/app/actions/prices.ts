// src/app/actions/prices.ts
'use server'

import { cachePrices, cacheFX } from '@/lib/firestore.etf';
import { fetchYahooMonthly } from '@/lib/providers/yahoo';
import { fetchECBMonthlyEUR } from '@/lib/providers/ecb';
import { defaultTickerForISIN } from '@/lib/providers/yahoo';
import type { ETFComponent, ETFPricePoint } from '@/lib/types.etf';

// This server action needs to be called with the user's UID.
// In a real app, you would get this from the session.
// For now, we will pass it as an argument.

export async function refreshEtfPlanPrices(uid: string, planId: string, components: ETFComponent[], since: string) {
    try {
        // 1) Resolve symbol for each component (ticker override or default mapping)
        const items = components.map(c => ({
            ...c,
            symbol: c.ticker || defaultTickerForISIN(c.isin, c.preferredExchange),
        }));

        // 2) Fetch monthly bars per symbol
        const monthlyBySymbol: Record<string, ETFPricePoint[]> = {};
        await Promise.all(items.map(async c => {
            if (c.symbol) {
                const bars = await fetchYahooMonthly(c.symbol, since);
                monthlyBySymbol[c.symbol] = bars;
            }
        }));

        // 3) Fetch FX monthly (EUR base)
        const fx = await fetchECBMonthlyEUR(since);

        // 4) Persist to Firestore
        await cachePrices(uid, planId, monthlyBySymbol);
        await cacheFX(uid, fx);

        return { ok: true, message: "Price data refreshed successfully." };
    } catch (error) {
        console.error("Error refreshing ETF plan prices:", error);
        return { ok: false, error: (error as Error).message || "An unknown error occurred." };
    }
}
