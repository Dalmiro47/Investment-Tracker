
'use client';
import React, { useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Info, Download } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/money';
import { format, parseISO } from 'date-fns';
import type { PlanRowDrift, ETFComponent } from '@/lib/types.etf';
import { downloadCSV } from '@/lib/csv';
import { ColumnHelpDialog } from "@/components/ColumnHelpDialog";

type DriftTableProps = {
  rows: PlanRowDrift[];
  components: ETFComponent[];
  availableYears: number[];
  yearFilter: string;
  onYearFilterChange: (year: string) => void;
};

const sumBy = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((s, x) => s + (f(x) || 0), 0);

const DRIFT_HELP = [
  { label: "Date", desc: "End of each month in the simulation period." },
  { label: "Contribution", desc: "Fixed amount invested that month before any fees." },
  { label: "Fees (€)", desc: "Total fees applied for the period. In this model fees accrue and are applied at year-end, so you’ll only see non-zero values in December or the final month." },
  { label: "Value (€)", desc: "Total market value of the entire portfolio at month end (after fees/rebalancing/buys)." },
  { label: "[ETF] Value", desc: "Portfolio value held in each specific ETF for that month end." },
  { label: "[ETF] Drift", desc: "How far the ETF’s actual weight is from its target weight (positive = overweight, negative = underweight)." },
];


export default function DriftTable({ rows, components, availableYears, yearFilter, onYearFilterChange }: DriftTableProps) {
  const [etfFilter, setEtfFilter] = useState<string>('ALL');
  const [showDriftHelp, setShowDriftHelp] = useState(false);

  const rowsDesc = useMemo(
    () => [...rows].sort((a, b) => b.date.localeCompare(a.date)),
    [rows]
  );

  const driftTotals = useMemo(() => ({
    contribution: sumBy(rowsDesc, r => r.contribution),
    fees: sumBy(rowsDesc, r => r.fees),
    value: rowsDesc.length > 0 ? rowsDesc[0].portfolioValue : 0,
  }), [rowsDesc]);
  
  const rowsForCsv = rowsDesc;

  const visibleComponents = useMemo(() => {
    if (etfFilter === 'ALL') return components;
    return components.filter(c => c.id === etfFilter);
  }, [components, etfFilter]);

  const handleExportCsv = useCallback(() => {
    const headers = [
      'Date','Contribution(EUR)', 'Fees(EUR)', 'PortfolioValue(EUR)',
      ...visibleComponents.map(c => `${c.name} Value(EUR)`),
      ...visibleComponents.map(c => `${c.name} Drift(%)`),
    ];
  
    const dataRows: (string|number)[][] = rowsForCsv.map(row => {
      const vals: (string|number)[] = [
        row.date.slice(0,10),
        row.contribution.toFixed(2),
        (row.fees ?? 0).toFixed(2),
        row.portfolioValue.toFixed(2),
      ];
      visibleComponents.forEach(c => {
        const pos = row.positions.find(p => p.symbol === c.ticker);
        vals.push((pos?.valueEUR ?? 0).toFixed(2));
      });
      visibleComponents.forEach(c => {
        const pos = row.positions.find(p => p.symbol === c.ticker);
        const driftPct = (pos?.driftPct ?? 0) * 100;
        vals.push(driftPct.toFixed(4));
      });
      return vals;
    });

    dataRows.push([
        'TOTAL',
        driftTotals.contribution.toFixed(2),
        driftTotals.fees.toFixed(2),
        driftTotals.value.toFixed(2),
        ...Array(visibleComponents.length * 2).fill('')
    ]);
  
    downloadCSV('drift.csv', headers, dataRows);
  }, [rowsForCsv, visibleComponents, driftTotals]);

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
      <ColumnHelpDialog
        open={showDriftHelp}
        onOpenChange={setShowDriftHelp}
        title="Drift View — Column Help"
        items={DRIFT_HELP}
      />
        <CardHeader className="flex flex-row justify-between items-center">
            <div className="flex items-center gap-2">
                <div>
                    <CardTitle>Monthly Simulation Details (Drift)</CardTitle>
                    <CardDescription>Breakdown of portfolio evolution month by month.</CardDescription>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowDriftHelp(true)}><Info className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-4">
                <Select value={yearFilter} onValueChange={onYearFilterChange}>
                    <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Filter by year" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Years</SelectItem>
                        {availableYears.map(year => (
                            <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                 <Select value={etfFilter} onValueChange={setEtfFilter}>
                    <SelectTrigger className="w-[220px]"><SelectValue placeholder="All ETFs" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All ETFs</SelectItem>
                        {components.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handleExportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
            </div>
        </CardHeader>
        <CardContent>
            <div className="scroll-area max-h-[60vh] overflow-auto rounded-md border">
                <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Contribution</TableHead>
                            <TableHead className="text-right">Fees (€)</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                            {visibleComponents.map(c => <TableHead key={`v-${c.id}`} className="text-right">{c.name} Value</TableHead>)}
                            {visibleComponents.map(c => <TableHead key={`d-${c.id}`} className="text-right">{c.name} Drift</TableHead>)}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rowsDesc.map(row => (
                            <TableRow key={row.date}>
                                <TableCell>{format(parseISO(row.date), 'MMM yyyy')}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(row.contribution)}</TableCell>
                                <TableCell className="text-right font-mono">
                                    {(row.fees ?? 0) > 0 
                                      ? <span className="text-red-500 font-medium">{formatCurrency(row.fees)}</span>
                                      : '—'}
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold">{formatCurrency(row.portfolioValue)}</TableCell>
                                {visibleComponents.map(comp => {
                                    const pos = row.positions.find(p => p.symbol === comp.ticker);
                                    return <TableCell key={`rv-${row.date}-${comp.id}`} className="text-right font-mono">{formatCurrency(pos?.valueEUR ?? 0)}</TableCell>
                                })}
                                {visibleComponents.map(comp => {
                                    const pos = row.positions.find(p => p.symbol === comp.ticker);
                                    const drift = pos?.driftPct ?? 0;
                                    return <TableCell key={`rd-${row.date}-${comp.id}`} className={`text-right font-mono ${drift > 0.01 ? 'text-green-500' : drift < -0.01 ? 'text-destructive' : ''}`}>{formatPercent(drift)}</TableCell>
                                })}
                            </TableRow>
                        ))}
                    </TableBody>
                     <tfoot className="sticky bottom-0 bg-muted/30">
                        <tr className="border-t font-medium">
                            <td className="p-2">Total ({yearFilter === 'all' ? 'All Time' : yearFilter})</td>
                            <td className="p-2 text-right font-mono">{formatCurrency(driftTotals.contribution)}</td>
                            <td className="p-2 text-right font-mono">{formatCurrency(driftTotals.fees)}</td>
                            <td className="p-2 text-right font-mono">{formatCurrency(driftTotals.value)}</td>
                            <td colSpan={visibleComponents.length * 2}></td>
                        </tr>
                    </tfoot>
                </Table>
            </div>
        </CardContent>
    </Card>
  );
}
