
'use client';
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Info, ArrowDownToLine } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/money';
import { format, parseISO } from 'date-fns';
import type { PlanRowDrift, ETFComponent } from '@/lib/types.etf';

type DriftTableProps = {
  rows: PlanRowDrift[];
  components: ETFComponent[];
  availableYears: number[];
  yearFilter: string;
  onYearFilterChange: (year: string) => void;
};

export default function DriftTable({ rows, components, availableYears, yearFilter, onYearFilterChange }: DriftTableProps) {
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
        <CardHeader className="flex flex-row justify-between items-center">
            <div className="flex items-center gap-2">
                <div>
                    <CardTitle>Monthly Simulation Details (Drift)</CardTitle>
                    <CardDescription>Breakdown of portfolio evolution month by month.</CardDescription>
                </div>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="icon"><Info className="h-4 w-4" /></Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Drift View Column Explanations</DialogTitle>
                        </DialogHeader>
                        <div className="text-sm space-y-3 py-4">
                            <div><h4 className="font-semibold">Date</h4><p className="text-muted-foreground">The end of each month in the simulation period.</p></div>
                            <div><h4 className="font-semibold">Contribution</h4><p className="text-muted-foreground">The fixed amount invested that month before any fees.</p></div>
                            <div><h4 className="font-semibold">Value</h4><p className="text-muted-foreground">The total market value of your entire portfolio at the end of the month.</p></div>
                            <div><h4 className="font-semibold">[ETF] Value</h4><p className="text-muted-foreground">The portion of your total portfolio value held in that specific ETF.</p></div>
                            <div><h4 className="font-semibold">[ETF] Drift</h4><p className="text-muted-foreground">How far the ETF's actual weight is from its target weight. A positive (green) drift means it's overweight; a negative (red) drift means it's underweight.</p></div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
            <div className="flex items-center gap-4">
                <Select value={yearFilter} onValueChange={onYearFilterChange}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by year" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Years</SelectItem>
                        {availableYears.map(year => (
                            <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button variant="outline" size="sm" disabled><ArrowDownToLine className="mr-2 h-4 w-4" />Export CSV</Button>
            </div>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Contribution</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        {components.map(c => <TableHead key={c.id} className="text-right">{c.name} Value</TableHead>)}
                        {components.map(c => <TableHead key={c.id} className="text-right">{c.name} Drift</TableHead>)}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map(row => (
                        <TableRow key={row.date}>
                            <TableCell>{format(parseISO(row.date), 'MMM yyyy')}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(row.contribution)}</TableCell>
                            <TableCell className="text-right font-mono font-bold">{formatCurrency(row.portfolioValue)}</TableCell>
                            {components.map(comp => {
                                const pos = row.positions.find(p => p.symbol === comp.ticker);
                                return <TableCell key={comp.id} className="text-right font-mono">{formatCurrency(pos?.valueEUR ?? 0)}</TableCell>
                            })}
                            {components.map(comp => {
                                const pos = row.positions.find(p => p.symbol === comp.ticker);
                                const drift = pos?.driftPct ?? 0;
                                return <TableCell key={comp.id} className={`text-right font-mono ${drift > 0.01 ? 'text-green-500' : drift < -0.01 ? 'text-destructive' : ''}`}>{formatPercent(drift)}</TableCell>
                            })}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </CardContent>
    </Card>
  );
}
