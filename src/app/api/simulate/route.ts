
import { NextResponse } from 'next/server';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { getPricePointsServer, getFXRatesServer } from '@/lib/firestore.etf.server';
import { simulatePlan } from '@/lib/etf/engine';
import type { PlanRow } from '@/lib/etf/engine';

export const runtime = 'nodejs'; // ensure Admin SDK works

export async function POST(req: Request) {
  try {
    const { uid, plan, components } = await req.json();

    if (!uid || !plan || !components) {
        return NextResponse.json({ ok: false, error: 'Missing required parameters.' }, { status: 400 });
    }

    const start = format(startOfMonth(parseISO(plan.startDate)), 'yyyy-MM-dd');
    const end   = format(endOfMonth(new Date()), 'yyyy-MM-dd');

    const perSymbol: Record<string, any> = {};
    const currencies = new Set<string>();

    await Promise.all(components.map(async (c: any) => {
      const symbol = c.ticker;
      if (!symbol) return;
      const pts = await getPricePointsServer(uid, plan.id, symbol, start, end);
      perSymbol[symbol] = pts;
      Object.values(pts).forEach((p: any) => currencies.add(p.currency));
    }));

    const needsFx = currencies.size > 1 || (currencies.size === 1 && !currencies.has('EUR'));
    const fx = needsFx ? await getFXRatesServer(uid, start, end) : {};

    const simulationResult: PlanRow[] = simulatePlan(plan, components, perSymbol, fx);

    // Sanitize the data to be plain objects before returning to the client.
    const wire = simulationResult.map(row => JSON.parse(JSON.stringify(row)));

    return NextResponse.json({ ok: true, rows: wire });
  } catch (e: any) {
    console.error('simulate API error:', e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? 'An unknown error occurred during simulation.') }, { status: 500 });
  }
}

    