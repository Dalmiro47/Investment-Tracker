
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

    const startISO = format(startOfMonth(parseISO(plan.startDate)), 'yyyy-MM-dd');
    let endISO = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    const startMonth = startISO.slice(0, 7);

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

    endISO = format(endOfMonth(parseISO(`${lastCommonMonth}-01`)), 'yyyy-MM-dd');
    
    const allMonthsInRange = monthsBetween(startMonth, lastCommonMonth);
    
    for (const sym of Object.keys(perSymbol)) {
        const pts = perSymbol[sym];
        const firstRealMonth = Object.keys(pts).sort()[0];

        // Carry-forward prices only AFTER the first real data point
        for (const m of allMonthsInRange) {
            if (m < firstRealMonth) continue; // Do not backfill before first real price
            if (!pts[m]) {
                // Find the latest month < m that exists
                const prev = Object.keys(pts).filter(x => x < m).sort().pop();
                if (prev) pts[m] = { ...pts[prev], month: m, date: `${m}-01` };
            }
        }
        
        // Trim any months beyond the common last month
        for (const m of Object.keys(pts)) {
            if (m > lastCommonMonth) delete pts[m];
        }
    }


    const needsFx = currencies.size > 1 || (currencies.size === 1 && !currencies.has('EUR'));
    const fx = needsFx ? await getFXRatesServer(uid, startISO, endISO) : {};

    const simulationResult: PlanRow[] = simulatePlan(plan, components, perSymbol, fx);

    // API Guard: Sanitize the data to be plain objects and filter out pre-start rows
    const simStartMonth = plan.startDate.slice(0, 7);
    const wire = simulationResult
      .filter(row => row.date.slice(0, 7) >= simStartMonth)
      .map(row => JSON.parse(JSON.stringify(row)));

    return NextResponse.json({ ok: true, rows: wire });
  } catch (e: any) {
    console.error('simulate API error:', e);
    return NextResponse.json({ ok: false, error: String(e?.message ?? 'An unknown error occurred during simulation.') }, { status: 500 });
  }
}
