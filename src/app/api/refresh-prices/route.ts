
import { NextResponse } from 'next/server';
import { format, parseISO, startOfMonth } from 'date-fns';
import { refreshEtfPlanPrices } from '@/app/actions/prices';
import type { ETFComponent } from '@/lib/types.etf';
import { upsertCurrentMonthFromJustETF } from '@/lib/providers/justetf';

export const runtime = 'nodejs';

export async function POST(req: Request) {
    try {
        const { uid, planId, components, startDate } = await req.json();
        if (!uid || !planId || !components || !startDate) {
            return NextResponse.json({ ok: false, error: 'Missing required parameters.' }, { status: 400 });
        }
        
        // 1. Fetch historical data from Yahoo
        const since = format(startOfMonth(parseISO(startDate)), 'yyyy-MM-dd');
        const yahooResult = await refreshEtfPlanPrices(uid, planId, components, since);

        if (!yahooResult.ok) {
            // If Yahoo fails, we might still proceed with JustETF but log the error
            console.warn("Yahoo price refresh failed, proceeding with JustETF. Error:", yahooResult.error);
        }

        // 2. Supplement with latest price from JustETF
        let justEtfSuccessCount = 0;
        let lastError = null;
        for (const c of (components as ETFComponent[])) {
            if (c.isin && c.ticker) {
                try {
                    await upsertCurrentMonthFromJustETF(uid, planId, c.ticker, c.isin);
                    justEtfSuccessCount++;
                } catch (e: any) {
                    lastError = e.message;
                    console.warn(`Failed to update ${c.ticker} from JustETF:`, e.message);
                }
            }
        }
        
        const yahooMessage = yahooResult.message || "No update from Yahoo.";
        const justEtfMessage = justEtfSuccessCount > 0 
            ? `Successfully updated ${justEtfSuccessCount} symbols with the latest price from JustETF.`
            : "No symbols updated from JustETF.";

        return NextResponse.json({ 
            ok: true, 
            message: `${yahooMessage} ${justEtfMessage}` 
        });

    } catch (e: any) {
        console.error('refresh-prices API error:', e);
        return NextResponse.json({ ok: false, error: String(e?.message ?? 'An unknown error occurred during price refresh.') }, { status: 500 });
    }
}
