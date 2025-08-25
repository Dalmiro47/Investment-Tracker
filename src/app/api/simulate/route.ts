
import { NextResponse } from 'next/server';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { getPricePointsServer, getFXRatesServer } from '@/lib/firestore.etf.server';
import { simulatePlan } from '@/lib/etf/engine';
import type { PlanRow } from '@/lib/etf/engine';

export const runtime = 'nodejs'; // ensure Admin SDK works

const monthKeys = (pts: Record<string, any>) =>
  Object.keys(pts).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();

const monthsBetween = (start: string, end: string) => {
  const out: string[] = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2,'0')}`);
    m++; if (m === 13) { m = 1; y++; }
  }
  return out;
};

export async function POST(req: Request) {
  try {
    const { uid, plan, components } = await req.json();

    if (!uid || !plan || !components) {
        return NextResponse.json({ ok: false, error: 'Missing required parameters.' }, { status: 400 });
    }
    
    // Timezone-safe start month derivation
    const startISO = format(startOfMonth(parseISO(plan.startDate)), 'yyyy-MM-dd');
    const startMonth = startISO.slice(0, 7);
    let endISO = format(endOfMonth(new Date()), 'yyyy-MM-dd');

    const perSymbol: Record<string, Record<string, any>> = {};
    const currencies = new Set<string>();

    await Promise.all(components.map(async (c: any) => {
      const symbol = c.ticker;
      if (!symbol) return;
      const pts = await getPricePointsServer(uid, plan.id, symbol, startISO, endISO);
      perSymbol[symbol] = pts;
      Object.values(pts).forEach((p: any) => { 
        if (p.currency) currencies.add(p.currency) 
      });
    }));

    // Hard-trim: never allow months < startMonth in the working data set
    for (const sym of Object.keys(perSymbol)) {
        const map = perSymbol[sym];
        for (const m of Object.keys(map)) {
            if (m < startMonth) delete map[m];
        }
    }

    const monthsPerSymbol = Object.values(perSymbol).map(pts => monthKeys(pts));
    if (monthsPerSymbol.every(ms => ms.length === 0)) {
        // This case can happen if no data source has any data for any symbol yet.
        const allSymbols = components.map((c:any) => c.ticker);
        return NextResponse.json({ 
            ok: false, 
            code: 'MISSING_PRICES',
            message: `No price data found for any symbols. Refresh data or add manual prices for the first month.`,
            missing: [{ month: startMonth, missingFor: allSymbols }]
        }, { status: 400 });
    }
    
    const lastMonths = monthsPerSymbol.filter(ms => ms.length > 0).map(ms => ms[ms.length - 1]);
    const lastCommonMonth = lastMonths.length > 0 ? lastMonths.sort()[0] : startMonth;
    
    const allMonthsInRange = monthsBetween(startMonth, lastCommonMonth);
    
    // --- START: Hardened price validation logic ---
    const missingPrices: { month: string; missingFor: string[] }[] = [];
    for (const month of allMonthsInRange) {
        const lackingSymbols = components
            .filter((c: any) => c.ticker && !perSymbol[c.ticker]?.[month])
            .map((c: any) => c.ticker);
        
        if (lackingSymbols.length > 0) {
            missingPrices.push({ month, missingFor: lackingSymbols });
        }
    }

    if (missingPrices.length > 0) {
        return NextResponse.json({
            ok: false,
            code: 'MISSING_PRICES',
            message: 'Some months are missing prices. Please add manual prices to proceed.',
            missing: missingPrices
        }, { status: 400 });
    }
    // --- END: Hardened price validation logic ---


    // Carry-forward prices only AFTER the first real data point for each symbol
    for (const sym of Object.keys(perSymbol)) {
        const pts = perSymbol[sym];
        const firstRealMonth = Object.keys(pts).sort()[0];

        for (const m of allMonthsInRange) {
            if (m < firstRealMonth) continue; // Do not backfill before first real price
            if (!pts[m]) {
                const prev = Object.keys(pts).filter(x => x < m).sort().pop();
                if (prev) pts[m] = { ...pts[prev], month: m, date: `${m}-01`, source: 'forward-fill' };
            }
        }
        
        // Extra safety: trim any months outside the simulation window
        for (const m of Object.keys(pts)) {
            if (m < startMonth || m > lastCommonMonth) delete pts[m];
        }
    }

    const needsFx = currencies.size > 1 || (currencies.size === 1 && !currencies.has('EUR'));
    const fx = needsFx ? await getFXRatesServer(uid, startISO, endISO) : {};

    const simulationResult: PlanRow[] = simulatePlan(plan, components, perSymbol, fx, { endMonth: lastCommonMonth });

    // API Guard: Sanitize the data to be plain objects and filter out pre-start rows
    const simStartMonth = startMonth;
    const wire = simulationResult
      .filter(row => row.date.slice(0, 7) >= simStartMonth)
      .map(row => JSON.parse(JSON.stringify(row)));

    return NextResponse.json({
        ok: true,
        meta: { startMonth, endMonth: lastCommonMonth },
        rows: wire
    });
  } catch (e: any) {
    console.error('simulate API error:', e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? 'An unknown error occurred during simulation.') }, { status: 500 });
  }
}
