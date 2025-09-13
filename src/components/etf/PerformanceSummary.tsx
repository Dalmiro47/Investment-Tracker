
'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/money';
import type { PlanRowPerformance, PlanRowDrift, ETFComponent } from '@/lib/types.etf';
import { xirr } from '@/lib/xirr';

type Props = {
  perfRows: PlanRowPerformance[];   // already filtered by year + ETF
  driftRows: PlanRowDrift[];        // same period (use effectiveDriftRows)
  components: ETFComponent[];
  showPerEtf?: boolean;
};

export default function PerformanceSummary({ perfRows, driftRows, components, showPerEtf = false }: Props) {
  if (!perfRows.length) return null;
  const last = perfRows[0]; // tables are sorted newest->oldest

  // Sum contributions per month from perfRows (visible ETFs only)
  const totalContrib = perfRows.reduce((acc, r) =>
    acc + r.perEtf.reduce((s, e) => s + Number(e.contribThisMonth), 0), 0);

  // Fees from drift for same period
  const totalFees = driftRows.reduce((acc, r) => acc + (r.fees ?? 0), 0);

  const endValue = Number(last.totalValue);
  const netInvested = totalContrib - totalFees;
  const totalGain = endValue - netInvested;
  const simpleRet = netInvested > 0 ? totalGain / netInvested : 0;
  const growthShare = endValue > 0 ? totalGain / endValue : 0;
  const contribMultiple = totalContrib > 0 ? endValue / totalContrib : 0;

  // Portfolio cashflows for XIRR: monthly outflows (contrib) and fees (also outflow), final inflow = endValue at last month end
  const cf = perfRows.map(r => ({
    date: new Date(r.dateKey + '-28'), // any day in month; consistent is enough
    amount: - r.perEtf.reduce((s, e) => s + Number(e.contribThisMonth), 0)
  }));
  // add fees as outflows on the same months
  driftRows.forEach(dr => {
    const key = dr.date.slice(0,7);
    const idx = cf.findIndex(c => c.date.toISOString().slice(0,7) === key);
    if (idx >= 0) cf[idx].amount -= (dr.fees ?? 0);
  });
  // terminal inflow
  cf.unshift(); // no-op, keeps order; we rely on map order
  cf.push({ date: new Date(last.dateKey + '-28'), amount: endValue });

  const irr = xirr(cf);

  // Optional per-ETF mini table
  let perEtfRows: { name: string; invested: number; value: number; gain: number; ret: number; irr: number | null }[] = [];
  if (showPerEtf) {
    const latest = perfRows[0];
    perEtfRows = latest.perEtf.map(e => {
      const invested = Number(e.cumulativeContrib);
      const value = Number(e.valueNow);
      const gain = value - invested;
      const ret = invested > 0 ? gain / invested : 0;

      // ETF cashflows for XIRR
      const flows = perfRows.map(r => {
        const x = r.perEtf.find(p => p.etfId === e.etfId);
        return { date: new Date(r.dateKey + '-28'), amount: - (x ? Number(x.contribThisMonth) : 0) };
      });
      flows.push({ date: new Date(latest.dateKey + '-28'), amount: value });

      return { name: e.name ?? e.etfId, invested, value, gain, ret, irr: xirr(flows) };
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-4">
      <Card><CardHeader><CardTitle>{formatCurrency(totalContrib)}</CardTitle><CardContent className="pt-0 text-muted-foreground">Contributions (period)</CardContent></CardHeader></Card>
      <Card><CardHeader><CardTitle>{formatCurrency(totalFees)}</CardTitle><CardContent className="pt-0 text-muted-foreground">Fees (period)</CardContent></CardHeader></Card>
      <Card><CardHeader><CardTitle>{formatCurrency(endValue)}</CardTitle><CardContent className="pt-0 text-muted-foreground">End Value</CardContent></CardHeader></Card>
      <Card><CardHeader><CardTitle className={totalGain>=0?'text-green-500':'text-destructive'}>{formatCurrency(totalGain)}</CardTitle><CardContent className="pt-0 text-muted-foreground">Total Gain</CardContent></CardHeader></Card>
      <Card><CardHeader><CardTitle className={simpleRet>=0?'text-green-500':'text-destructive'}>{formatPercent(simpleRet)}{irr!=null && ` / ${formatPercent(irr)}`}</CardTitle><CardContent className="pt-0 text-muted-foreground">Simple % / XIRR</CardContent></CardHeader></Card>

      {/* growth vs contrib tiny bar */}
      <div className="md:col-span-2 lg:col-span-5">
        <div className="h-3 rounded bg-muted overflow-hidden">
          <div
            className="h-3 bg-green-500"
            style={{ width: `${Math.max(0, Math.min(100, growthShare*100))}%` }}
            title={`Growth share: ${formatPercent(growthShare)}`}
          />
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Growth share: <span className="font-medium">{formatPercent(growthShare)}</span> · Contribution multiple: <span className="font-medium">{contribMultiple.toFixed(2)}×</span>
        </div>
      </div>

      {showPerEtf && (
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
