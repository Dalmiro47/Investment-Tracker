
import { NextResponse } from 'next/server';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { getPricePointsServer, getFXRatesServer } from '@/lib/firestore.etf.server';
import { simulatePlan } from '@/lib/etf/engine';
import type { PlanRow } from '@/lib/etf/engine';

export const runtime = 'nodejs'; // ensure Admin SDK works

const monthKeys = (pts: Record<string, any>) =>
  Object.keys(pts).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();


export async function POST(req: Request) {
  try {
    const { uid, plan, components } = await req.json();

    if (!uid || !plan || !components) {
        return NextResponse.json({ ok: false, error: 'Missing required parameters.' }, { status: 400 });
    }

    const startISO = format(startOfMonth(parseISO(plan.startDate)), 'yyyy-MM-dd');
    let endISO   = format(endOfMonth(new Date()), 'yyyy-MM-dd');

    const perSymbol: Record<string, Record<string, any>> = {};
    const currencies = new Set<string>();

    await Promise.all(components.map(async (c: any) => {
      const symbol = c.ticker;
      if (!symbol) return;
      const pts = await getPricePointsServer(uid, plan.id, symbol, startISO, endISO);
      perSymbol[symbol] = pts;
      Object.values(pts).forEach((p: any) => currencies.add(p.currency));
    }));

    // Find the latest month that exists for every symbol
    const monthsPerSymbol = Object.values(perSymbol).map(pts => monthKeys(pts));
    if (monthsPerSymbol.some(ms => ms.length === 0)) {
      return NextResponse.json({ ok: false, error: 'No price data for one or more symbols. Refresh Price Data.' }, { status: 400 });
    }
    const lastMonths = monthsPerSymbol.map(ms => ms[ms.length - 1]); // each symbol’s last available month
    const lastCommonMonth = lastMonths.sort()[0]; // earliest among those (intersection cap)

    // Trim any months beyond lastCommonMonth to avoid a trailing zero row
    for (const sym in perSymbol) {
      for (const m of Object.keys(perSymbol[sym])) {
        if (m > lastCommonMonth) delete perSymbol[sym][m];
      }
    }
    
    // Cap end of sim to lastCommonMonth’s end
    endISO = format(endOfMonth(parseISO(`${lastCommonMonth}-01`)), 'yyyy-MM-dd');


    const needsFx = currencies.size > 1 || (currencies.size === 1 && !currencies.has('EUR'));
    const fx = needsFx ? await getFXRatesServer(uid, startISO, endISO) : {};

    const simulationResult: PlanRow[] = simulatePlan(plan, components, perSymbol, fx);

    // Sanitize the data to be plain objects before returning to the client.
    const wire = simulationResult.map(row => JSON.parse(JSON.stringify(row)));

    return NextResponse.json({ ok: true, rows: wire });
  } catch (e: any) {
    console.error('simulate API error:', e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? 'An unknown error occurred during simulation.') }, { status: 500 });
  }
}

    
