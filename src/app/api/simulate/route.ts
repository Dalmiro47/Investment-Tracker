
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

const backfillLeft = (pts: Record<string, any>, months: string[]) => {
  const available = Object.keys(pts).sort();
  if (available.length === 0) return pts;
  const first = available[0];
  for (const m of months) {
    if (m < first && !pts[m]) {
      // clone first available price as constant
      const p = pts[first];
      pts[m] = { ...p, month: m, date: `${m}-01` };
    }
  }
  return pts;
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

    // backfill left
    const allMonthsInRange = monthsBetween(startMonth, lastCommonMonth);
    for (const sym of Object.keys(perSymbol)) {
      perSymbol[sym] = backfillLeft(perSymbol[sym], allMonthsInRange);
      // Also ensure we have entries for *all* months in range (carry forward)
      for (const m of allMonthsInRange) {
        if (!perSymbol[sym][m]) {
          // find the latest month < m
          const prev = [...Object.keys(perSymbol[sym])].filter(x => x <= m).sort().pop();
          if (prev) perSymbol[sym][m] = { ...perSymbol[sym][prev], month: m, date: `${m}-01` };
        }
      }
      // Trim any months beyond lastCommonMonth to avoid a trailing zero row
      for (const m of Object.keys(perSymbol[sym])) {
        if (m > lastCommonMonth) delete perSymbol[sym][m];
      }
    }

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
