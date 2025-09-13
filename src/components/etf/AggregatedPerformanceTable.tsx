
'use client';
import React from 'react';
import { ETFComponent, PlanRowPerformance } from '@/lib/types.etf';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/money';
import { xirr } from '@/lib/xirr';
import { downloadCSV } from '@/lib/csv';

type Props = {
  rows: PlanRowPerformance[];
  components: ETFComponent[];
  availableYears: number[];
  yearFilter: string;
  onYearFilterChange: (year: string) => void;
};

export default function AggregatedPerformanceTable({
  rows, components, availableYears, yearFilter, onYearFilterChange
}: Props) {
  const [etfFilter, setEtfFilter] = React.useState<string>('ALL');

  const rowsDesc = React.useMemo(
    () => [...rows].sort((a,b) => b.dateKey.localeCompare(a.dateKey)),
    [rows]
  );

  const rowsFiltered = React.useMemo(() => {
    if (yearFilter === 'all') return rowsDesc;
    return rowsDesc.filter(r => r.dateKey.slice(0,4) === yearFilter);
  }, [rowsDesc, yearFilter]);

  // ---- per-ETF aggregation (invested, latest value, return, XIRR)
  const perEtf = React.useMemo(() => {
    const map = new Map<string, {
      id: string; name: string;
      invested: number;
      value: number;
      lastMonth?: string;
      flows: { date: Date; amount: number }[];
    }>();

    components.forEach(c => {
      if (etfFilter !== 'ALL' && etfFilter !== c.id) return;
      map.set(c.id, { id: c.id, name: c.name, invested: 0, value: 0, flows: [] });
    });

    rowsFiltered.slice().reverse().forEach(r => { // old -> new
      for (const e of r.perEtf) {
        const item = map.get(e.etfId);
        if (!item) continue;
        const c = Number(e.contribThisMonth);
        if (c) {
          item.invested += c;
          item.flows.push({ date: new Date(`${r.dateKey}-28`), amount: -c });
        }
      }
    });

    for (const r of rowsFiltered) { // newest -> oldest: first seen is latest
      for (const e of r.perEtf) {
        const item = map.get(e.etfId);
        if (!item || item.lastMonth) continue;
        item.value = Number(e.valueNow);
        item.lastMonth = r.dateKey;
      }
    }

    const out = Array.from(map.values()).map(m => {
      if (m.value > 0 && m.lastMonth) {
        m.flows.push({ date: new Date(`${m.lastMonth}-28`), amount: m.value });
      }
      const irr = (m.flows.some(f=>f.amount<0) && m.flows.some(f=>f.amount>0)) ? xirr(m.flows) : null;
      const gain = m.value - m.invested;
      const ret  = m.invested > 0 ? (gain / m.invested) : 0;
      return { ...m, gain, ret, irr };
    });

    return components
      .filter(c => (etfFilter==='ALL' || c.id===etfFilter))
      .map(c => out.find(x => x?.id === c.id)!)
      .filter(Boolean);
  }, [rowsFiltered, components, etfFilter]);

  // ---- portfolio totals (invested, end value for latest month in filtered, gain, % and XIRR)
  const totals = React.useMemo(() => {
    // Invested = sum of contributions in the filtered period (respecting etfFilter)
    const invested = rowsFiltered.reduce((sum, r) => {
      return sum + r.perEtf
        .filter(e => etfFilter==='ALL' || e.etfId===etfFilter)
        .reduce((s, e) => s + Number(e.contribThisMonth), 0);
    }, 0);

    // End value = sum of valueNow for the most recent month in the filtered set
    const latest = rowsFiltered[0];
    const endValue = latest
      ? latest.perEtf
          .filter(e => etfFilter==='ALL' || e.etfId===etfFilter)
          .reduce((s, e) => s + Number(e.valueNow), 0)
      : 0;

    const gain = endValue - invested;
    const ret  = invested > 0 ? (gain / invested) : 0;

    // XIRR flows: sum contributions across ETFs per month; final inflow = endValue at latest month
    const flows: {date: Date; amount: number}[] = [];
    rowsFiltered.slice().reverse().forEach(r => { // old -> new
      const c = r.perEtf
        .filter(e => etfFilter==='ALL' || e.etfId===etfFilter)
        .reduce((s, e) => s + Number(e.contribThisMonth), 0);
      if (c) flows.push({ date: new Date(`${r.dateKey}-28`), amount: -c });
    });
    if (endValue > 0 && latest) {
      flows.push({ date: new Date(`${latest.dateKey}-28`), amount: endValue });
    }
    const irr = (flows.some(f=>f.amount<0) && flows.some(f=>f.amount>0)) ? xirr(flows) : null;

    return { invested, endValue, gain, ret, irr };
  }, [rowsFiltered, etfFilter]);

  const handleExport = React.useCallback(() => {
    const headers = ['ETF','Invested(EUR)','Value(EUR)','Gain(EUR)','Return(%)','XIRR(%)'];
    const data = perEtf.map(r => [
      r.name,
      r.invested.toFixed(2),
      r.value.toFixed(2),
      r.gain.toFixed(2),
      (r.ret*100).toFixed(4),
      r.irr!=null ? (r.irr*100).toFixed(4) : ''
    ]);
    // Totals row at the end of CSV, too
    data.push([
      'TOTAL',
      totals.invested.toFixed(2),
      totals.endValue.toFixed(2),
      totals.gain.toFixed(2),
      (totals.ret*100).toFixed(4),
      totals.irr!=null ? (totals.irr*100).toFixed(4) : ''
    ]);
    downloadCSV('performance_aggregated.csv', headers, data);
  }, [perEtf, totals]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Performance — Aggregated</CardTitle>
          <CardDescription>Per-ETF totals for the selected period.</CardDescription>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Year</Label>
            <Select value={yearFilter} onValueChange={onYearFilterChange}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Years" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">ETF</Label>
            <Select value={etfFilter} onValueChange={setEtfFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="All ETFs" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All ETFs</SelectItem>
                {components.map(etf => <SelectItem key={etf.id} value={etf.id}>{etf.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="scroll-area max-h-[60vh] overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
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
              {perEtf.map(r => (
                <tr key={r.id}>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-right font-mono">{formatCurrency(r.invested)}</td>
                  <td className="p-2 text-right font-mono">{formatCurrency(r.value)}</td>
                  <td className={`p-2 text-right font-mono ${r.gain>=0?'text-green-500':'text-destructive'}`}>{formatCurrency(r.gain)}</td>
                  <td className={`p-2 text-right font-mono ${r.ret>=0?'text-green-500':'text-destructive'}`}>{formatPercent(r.ret)}</td>
                  <td className="p-2 text-right font-mono">{r.irr!=null ? formatPercent(r.irr) : '—'}</td>
                </tr>
              ))}
            </tbody>

            {/* TOTALS */}
            <tfoot className="sticky bottom-0 bg-muted/30">
              <tr className="border-t">
                <td className="p-2 font-medium">Total</td>
                <td className="p-2 text-right font-mono">{formatCurrency(totals.invested)}</td>
                <td className="p-2 text-right font-mono">{formatCurrency(totals.endValue)}</td>
                <td className={`p-2 text-right font-mono ${totals.gain>=0?'text-green-500':'text-destructive'}`}>{formatCurrency(totals.gain)}</td>
                <td className={`p-2 text-right font-mono ${totals.ret>=0?'text-green-500':'text-destructive'}`}>{formatPercent(totals.ret)}</td>
                <td className="p-2 text-right font-mono">{totals.irr!=null ? formatPercent(totals.irr) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
