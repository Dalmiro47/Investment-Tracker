'use client';
import React from 'react';
import { PlanRowPerformance, ETFComponent } from '@/lib/types.etf';
import { formatCurrency, formatPercent } from '@/lib/money';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Info, Download } from 'lucide-react';
import { downloadCSV } from '@/lib/csv';

type Props = {
  rows: PlanRowPerformance[];
  components: ETFComponent[];
  /** New: year filter props, like Drift tab */
  availableYears: number[];
  yearFilter: string; // "all" | "2023" | "2024" ...
  onYearFilterChange: (year: string) => void;
};

export function PerformanceTable({ rows, components, availableYears, yearFilter, onYearFilterChange }: Props) {
  const [etfFilter, setEtfFilter] = React.useState<string>('ALL');

  const rowsDesc = React.useMemo(
    () => [...rows].sort((a, b) => b.dateKey.localeCompare(a.dateKey)),
    [rows]
  );

  const filteredByYear = React.useMemo(() => {
    if (yearFilter === 'all') return rowsDesc;
    return rowsDesc.filter(r => r.dateKey.slice(0, 4) === yearFilter);
  }, [rowsDesc, yearFilter]);

  const filteredRows = React.useMemo(() => {
    if (etfFilter === 'ALL' || filteredByYear.length === 0) return filteredByYear;
    return filteredByYear
      .map(row => ({ ...row, perEtf: row.perEtf.filter(e => e.etfId === etfFilter) }))
      .filter(row => row.perEtf.length > 0);
  }, [filteredByYear, etfFilter]);
  
  const handleExportCsv = React.useCallback(() => {
    const headers = [
      'Date','ETF','UnitsStart','UnitsEnd','Price(EUR)','Contribution(EUR)',
      'Value(EUR)','MonthlyReturn(%)','MonthlyPnL(EUR)','CumPnL(EUR)',
    ];
  
    const rowsOut: (string|number)[][] = [];
    filteredRows.forEach(r => {
      r.perEtf.forEach(e => {
        rowsOut.push([
          r.dateKey,
          e.name ?? e.etfId,
          Number(e.unitsStart ?? 0).toFixed(6),
          Number(e.unitsEnd ?? 0).toFixed(6),
          Number(e.priceNow).toFixed(6),
          Number(e.contribThisMonth).toFixed(2),
          Number(e.valueNow).toFixed(2),
          e.monthlyReturnPct ? (Number(e.monthlyReturnPct) * 100).toFixed(4) : '',
          e.monthlyPnL ? Number(e.monthlyPnL).toFixed(2) : '',
          Number(e.cumulativePnL).toFixed(2),
        ]);
      });
    });
  
    downloadCSV('performance.csv', headers, rowsOut);
  }, [filteredRows]);

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>No simulation data to display.</p>
        <p>Run the simulation to see results.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <CardTitle>Performance Details</CardTitle>
            <CardDescription>Per-ETF monthly return and P&amp;L (price effect only) with cumulative P&amp;L.</CardDescription>
          </div>
          {/* Info dialog */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon"><Info className="h-4 w-4" /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Performance View — Column Help</DialogTitle></DialogHeader>
              <div className="text-sm space-y-3 py-2">
                <p><b>Units</b>: total units at end of month (after contributions).</p>
                <p><b>Price</b>: month’s price in EUR (instrument price converted via FX).</p>
                <p><b>Contribution (€)</b>: cash actually invested in that ETF during the month.</p>
                <p><b>Value (€)</b>: units × price at month end.</p>
                <p><b>Monthly Ret.</b>: (Priceₜ / Priceₜ₋₁ − 1). Empty for first month with price.</p>
                <p><b>Monthly P&amp;L</b>: Units at start × (Priceₜ − Priceₜ₋₁). Shows pure market move (excludes buys this month).</p>
                <p><b>Cum. P&amp;L</b>: Value − cumulative contributions to that ETF.</p>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Right controls: Year + ETF filters */}
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
            <Label htmlFor="etf-filter" className="text-sm">ETF</Label>
            <Select value={etfFilter} onValueChange={setEtfFilter}>
              <SelectTrigger id="etf-filter" className="w-[220px]">
                <SelectValue placeholder="All ETFs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All ETFs</SelectItem>
                {components.map(etf => <SelectItem key={etf.id} value={etf.id}>{etf.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="text-left p-2 font-medium">Date</th>
                <th className="text-left p-2 font-medium">ETF</th>
                <th className="text-right p-2 font-medium">Units</th>
                <th className="text-right p-2 font-medium">Price</th>
                <th className="text-right p-2 font-medium">Contribution (€)</th>
                <th className="text-right p-2 font-medium">Value (€)</th>
                <th className="text-right p-2 font-medium">Monthly Ret.</th>
                <th className="text-right p-2 font-medium">Monthly P&amp;L</th>
                <th className="text-right p-2 font-medium">Cum. P&amp;L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map(r =>
                r.perEtf.map(e => {
                  const monthlyPnL = e.monthlyPnL ? parseFloat(e.monthlyPnL) : NaN;
                  const cumulativePnL = parseFloat(e.cumulativePnL);
                  const monthlyRet = e.monthlyReturnPct ? parseFloat(e.monthlyReturnPct) : NaN;
                  return (
                    <tr key={`${r.dateKey}-${e.etfId}`}>
                      <td className="p-2 whitespace-nowrap">{r.dateKey}</td>
                      <td className="p-2 whitespace-nowrap font-medium">{e.name}</td>
                      <td className="p-2 text-right font-mono">{Number(e.unitsEnd).toFixed(4)}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(parseFloat(e.priceNow))}</td>
                      <td className="p-2 text-right font-mono text-blue-500">{formatCurrency(parseFloat(e.contribThisMonth))}</td>
                      <td className="p-2 text-right font-mono font-semibold">{formatCurrency(parseFloat(e.valueNow))}</td>
                      <td className={`p-2 text-right font-mono ${!isNaN(monthlyRet) ? (monthlyRet >= 0 ? 'text-green-500' : 'text-destructive') : ''}`}>
                        {!isNaN(monthlyRet) ? formatPercent(monthlyRet) : '—'}
                      </td>
                      <td className={`p-2 text-right font-mono ${!isNaN(monthlyPnL) ? (monthlyPnL >= 0 ? 'text-green-500' : 'text-destructive') : ''}`}>
                        {!isNaN(monthlyPnL) ? formatCurrency(monthlyPnL) : '—'}
                      </td>
                      <td className={`p-2 text-right font-mono font-semibold ${cumulativePnL >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                        {formatCurrency(cumulativePnL)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
