
'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/money';
import type { PlanRowPerformance, PlanRowDrift, ETFComponent } from '@/lib/types.etf';
import { xirr } from '@/lib/xirr';

type Props = {
  perfRows: PlanRowPerformance[];   // NOT sorted; may be ascending from engine
  driftRows: PlanRowDrift[];        // same period (already year-filtered in page)
  components: ETFComponent[];
  showPerEtf?: boolean;
  showPortfolioCards?: boolean;   // NEW
  showGrowthBar?: boolean;        // NEW
};

export default function PerformanceSummary({
  perfRows, driftRows, components,
  showPerEtf = false,
  showPortfolioCards = false,     // default off now
  showGrowthBar = false           // default off now
}: Props) {

  // Ensure chronological order (old -> new) so cashflows are stable
  const rowsAsc = React.useMemo(
    () => perfRows ? [...perfRows].sort((a, b) => a.dateKey.localeCompare(b.dateKey)) : [],
    [perfRows]
  );
  
  const {
    last, contribByMonth, feesByMonth, totalContrib, totalFees, endValue,
    netInvested, totalGain, simpleRet, irr, investedVsValuePct, perEtfRows
  } = React.useMemo(() => {
    if (!rowsAsc.length) {
      return { last: null, contribByMonth: new Map(), feesByMonth: new Map(), totalContrib: 0, totalFees: 0, endValue: 0, netInvested: 0, totalGain: 0, simpleRet: 0, irr: null, investedVsValuePct: 0, perEtfRows: [] };
    }

    const last = rowsAsc[rowsAsc.length - 1]; // correct last month snapshot

    // Per-month contributions from perf rows (visible ETFs only)
    const contribByMonth = new Map<string, number>();
    rowsAsc.forEach(r => {
      const c = r.perEtf.reduce((s, e) => s + Number(e.contribThisMonth), 0);
      contribByMonth.set(r.dateKey, c);
    });

    // Fees by month from drift rows (already filtered by year on the page)
    const feesByMonth = new Map<string, number>();
    driftRows.forEach(dr => {
      const m = dr.date.slice(0, 7);
      feesByMonth.set(m, (feesByMonth.get(m) ?? 0) + (dr.fees ?? 0));
    });

    const totalContrib = [...contribByMonth.values()].reduce((a, b) => a + b, 0);
    const totalFees = [...feesByMonth.values()].reduce((a, b) => a + b, 0);

    const endValue = Number(last.totalValue);
    // All-in basis: cash that left your pocket = contributions into ETFs + fees
    const netInvested = totalContrib + totalFees;
    const totalGain = endValue - netInvested;
    const simpleRet = netInvested > 0 ? totalGain / netInvested : 0;

    // Build portfolio cashflows for XIRR:
    //  - Each month: negative outflow (contrib + fee)
    //  - Final: positive inflow = endValue at last month
    const cf = rowsAsc.map(r => {
      const month = r.dateKey;                                     // 'YYYY-MM'
      const out = (contribByMonth.get(month) ?? 0) + (feesByMonth.get(month) ?? 0);
      return { date: new Date(`${month}-28`), amount: -out };      // consistent day in month
    });
    // XIRR requires at least one positive and one negative flow
    if (endValue > 0) {
      cf.push({ date: new Date(`${last.dateKey}-28`), amount: endValue });
    }
    const irr = (cf.some(c => c.amount < 0) && cf.some(c => c.amount > 0)) ? xirr(cf) : null;

    // Visual bar: compare End Value vs Net Invested (works even when underwater)
    const investedVsValuePct = netInvested > 0 ? Math.min(100, (endValue / netInvested) * 100) : 0;

    // Optional per-ETF mini table (no fees allocated here)
    const perEtfRows = showPerEtf ? latest.perEtf.map(e => {
        const invested = Number(e.cumulativeContrib);  // cash into ETF (excl. fees)
        const value = Number(e.valueNow);
        const gain = value - invested;
        const ret = invested > 0 ? gain / invested : 0;

        // ETF-level cashflows for XIRR (contrib only, no fee allocation)
        const flows = rowsAsc.map(r => {
          const x = r.perEtf.find(p => p.etfId === e.etfId);
          return { date: new Date(`${r.dateKey}-28`), amount: - (x ? Number(x.contribThisMonth) : 0) };
        });
        if (value > 0) flows.push({ date: new Date(`${latest.dateKey}-28`), amount: value });

        const etfIrr = (flows.some(f => f.amount < 0) && flows.some(f => f.amount > 0)) ? xirr(flows) : null;

        return { name: e.name ?? e.etfId, invested, value, gain, ret, irr: etfIrr };
    }) : [];

    return { last, contribByMonth, feesByMonth, totalContrib, totalFees, endValue, netInvested, totalGain, simpleRet, irr, investedVsValuePct, perEtfRows };

  }, [rowsAsc, driftRows, showPerEtf]);

  if (!perfRows || !perfRows.length) return null;


  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-4">
      {showPortfolioCards && (
        <>
          <Card><CardHeader><CardTitle>{formatCurrency(totalContrib)}</CardTitle><CardContent className="pt-0 text-muted-foreground">Contributions (period)</CardContent></CardHeader></Card>
          <Card><CardHeader><CardTitle>{formatCurrency(totalFees)}</CardTitle><CardContent className="pt-0 text-muted-foreground">Fees (period)</CardContent></CardHeader></Card>
          <Card><CardHeader><CardTitle>{formatCurrency(endValue)}</CardTitle><CardContent className="pt-0 text-muted-foreground">End Value</CardContent></CardHeader></Card>
          <Card><CardHeader><CardTitle className={totalGain>=0?'text-green-500':'text-destructive'}>{formatCurrency(totalGain)}</CardTitle><CardContent className="pt-0 text-muted-foreground">Total {totalGain>=0?'Gain':'Loss'}</CardContent></CardHeader></Card>
          <Card><CardHeader><CardTitle className={simpleRet>=0?'text-green-500':'text-destructive'}>
            {formatPercent(simpleRet)}{irr!=null ? ` / ${formatPercent(irr)}` : ''}
          </CardTitle><CardContent className="pt-0 text-muted-foreground">Simple % / XIRR</CardContent></CardHeader></Card>
        </>
      )}


      {showGrowthBar && (
        <div className="md:col-span-2 lg:col-span-5">
            <div className="h-3 rounded bg-muted overflow-hidden">
            <div
                className={`h-3 ${endValue >= netInvested ? 'bg-green-500' : 'bg-destructive'}`}
                style={{ width: `${investedVsValuePct}%` }}
                title={`End Value / Net Invested: ${investedVsValuePct.toFixed(1)}%`}
            />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
            End Value vs Net Invested: <span className="font-medium">{investedVsValuePct.toFixed(1)}%</span>
            {' · '}All-in multiple: <span className="font-medium">
                {netInvested > 0 ? (endValue / netInvested).toFixed(2) + '×' : '—'}
            </span>
            </div>
        </div>
      )}


      {showPerEtf && perEtfRows.length > 0 && (
        <div className="md:col-span-2 lg:col-span-5">
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left p-2">ETF</th>
                  <th className="text-right p-2">Invested</th>
                  <th className="text-right p-2">Value</th>
                  <th className="text-right p-2">Gain</th>
                  <th className="text-right p-2">Return</th>
                  <th className="text-right p-2">XIRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {perEtfRows.map(r => (
                  <tr key={r.name}>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 text-right font-mono">{formatCurrency(r.invested)}</td>
                    <td className="p-2 text-right font-mono">{formatCurrency(r.value)}</td>
                    <td className={`p-2 text-right font-mono ${r.gain>=0?'text-green-500':'text-destructive'}`}>{formatCurrency(r.gain)}</td>
                    <td className={`p-2 text-right font-mono ${r.ret>=0?'text-green-500':'text-destructive'}`}>{formatPercent(r.ret)}</td>
                    <td className="p-2 text-right font-mono">{r.irr!=null ? formatPercent(r.irr) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

    