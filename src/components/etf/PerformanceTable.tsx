
'use client';
import React from 'react';
import { PlanRowPerformance, ETFComponent } from '@/lib/types.etf';
import { formatCurrency, formatPercent } from '@/lib/money';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function PerformanceTable({ rows, components }: { rows: PlanRowPerformance[]; components: ETFComponent[] }) {
  const [etfFilter, setEtfFilter] = React.useState<string>('ALL');

  const allEtfs = React.useMemo(() => {
    return components;
  }, [components]);

  const filteredRows = React.useMemo(() => {
    if (etfFilter === 'ALL' || rows.length === 0) return rows;
    
    return rows.map(row => {
      const filteredPerEtf = row.perEtf.filter(e => e.etfId === etfFilter);
      return { ...row, perEtf: filteredPerEtf };
    }).filter(row => row.perEtf.length > 0);
  }, [rows, etfFilter]);
  
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
      <CardHeader>
        <div className="flex justify-between items-center">
            <CardTitle>Performance Details</CardTitle>
            <div className="flex items-center gap-2">
                <Label htmlFor="etf-filter" className="text-sm">Filter by ETF</Label>
                <Select value={etfFilter} onValueChange={setEtfFilter}>
                    <SelectTrigger id="etf-filter" className="w-[200px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All ETFs</SelectItem>
                        {allEtfs.map(etf => <SelectItem key={etf.id} value={etf.id}>{etf.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
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
                <th className="text-right p-2 font-medium">Monthly P&L</th>
                <th className="text-right p-2 font-medium">Cum. P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map(r =>
                r.perEtf.map(e => {
                  const monthlyPnL = e.monthlyPnL ? parseFloat(e.monthlyPnL) : 0;
                  const cumulativePnL = parseFloat(e.cumulativePnL);
                  return (
                    <tr key={`${r.dateKey}-${e.etfId}`}>
                      <td className="p-2 whitespace-nowrap">{r.dateKey}</td>
                      <td className="p-2 whitespace-nowrap font-medium">{e.name}</td>
                      <td className="p-2 text-right font-mono">{Number(e.unitsEnd).toFixed(4)}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(parseFloat(e.priceNow))}</td>
                      <td className="p-2 text-right font-mono text-blue-500">{formatCurrency(parseFloat(e.contribThisMonth))}</td>
                      <td className="p-2 text-right font-mono font-semibold">{formatCurrency(parseFloat(e.valueNow))}</td>
                      <td className={`p-2 text-right font-mono ${e.monthlyReturnPct ? (parseFloat(e.monthlyReturnPct) >= 0 ? 'text-green-500' : 'text-destructive') : ''}`}>
                        {e.monthlyReturnPct ? formatPercent(parseFloat(e.monthlyReturnPct)) : '—'}
                      </td>
                      <td className={`p-2 text-right font-mono ${monthlyPnL >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                        {e.monthlyPnL ? formatCurrency(monthlyPnL) : '—'}
                      </td>
                       <td className={`p-2 text-right font-mono font-semibold ${cumulativePnL >= 0 ? 'text-green-500' : 'text-destructive'}`}>
                        {formatCurrency(cumulativePnL)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
