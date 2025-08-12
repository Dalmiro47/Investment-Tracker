
"use client";

import { useState, useMemo, useEffect } from 'react';
import type { Investment, Transaction } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent, toNum } from '@/lib/money';
import { aggregateByType, SummaryResult } from '@/lib/portfolio';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from './ui/dialog';


const CHART_COLORS = [
    'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
    'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(220 70% 50%)',
    'hsl(30 80% 55%)'
];

type DonutMode = 'market' | 'economic';

export default function PortfolioSummary({ investments, transactionsMap }: { investments: Investment[], transactionsMap: Record<string, Transaction[]> }) {
    
    const [donutMode, setDonutMode] = useState<DonutMode>('market');

    const summaryData: SummaryResult | null = useMemo(() => {
        if (investments.length === 0 || Object.keys(transactionsMap).length === 0) {
            return null;
        }
        return aggregateByType(investments, transactionsMap);
    }, [investments, transactionsMap]);
    
    const chartData = useMemo(() => {
        if (!summaryData) return [];

        const totalValue = donutMode === 'market'
            ? summaryData.totals.marketValue
            : summaryData.totals.economicValue;
        
        if (totalValue === 0) return [];

        return summaryData.rows
            .map(row => {
                const value = donutMode === 'market' ? row.marketValue : row.economicValue;
                return {
                    name: row.type,
                    value: value,
                    percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
                    fill: CHART_COLORS[summaryData.rows.findIndex(r => r.type === row.type) % CHART_COLORS.length]
                };
            })
            .filter(item => item.value > 0)
            .sort((a, b) => b.value - a.value);

    }, [summaryData, donutMode]);

    if (investments.length === 0) {
        return null;
    }

    if (!summaryData) {
        return (
            <Card>
                <CardHeader><CardTitle className="font-headline text-2xl">Portfolio Summary</CardTitle></CardHeader>
                <CardContent><Skeleton className="h-48 w-full" /></CardContent>
            </Card>
        )
    }

    const { rows, totals } = summaryData;
    const totalPortfolioValue = donutMode === 'market' ? totals.marketValue : totals.economicValue;

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-headline text-2xl">Portfolio Summary</CardTitle>
                 <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <Info className="h-5 w-5" />
                            <span className="sr-only">Show Explanations</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Summary Column Explanations</DialogTitle>
                            <DialogDescription>How each value in the summary table is calculated.</DialogDescription>
                        </DialogHeader>
                        <div className="text-sm space-y-4 max-h-[70vh] overflow-y-auto pr-4">
                            <div>
                                <h4 className="font-semibold">Cost Basis</h4>
                                <p className="text-muted-foreground">The original purchase price of the assets you currently still own. It ignores the cost of shares you've already sold. <br/><code className="text-xs">Formula: Available Quantity × Original Purchase Price per Unit</code></p>
                            </div>
                             <div>
                                <h4 className="font-semibold">Market Value</h4>
                                <p className="text-muted-foreground">The current value of the assets you currently still own. <br/><code className="text-xs">Formula: Available Quantity × Current Price per Unit</code></p>
                            </div>
                             <div>
                                <h4 className="font-semibold">Realized P/L (Profit/Loss)</h4>
                                <p className="text-muted-foreground">Your "locked-in" profit or loss from all sales you have made. This value is not affected by current price fluctuations. <br/><code className="text-xs">Formula: Sum of (Sell Price - Original Purchase Price) × Quantity Sold</code></p>
                            </div>
                             <div>
                                <h4 className="font-semibold">Unrealized P/L (Profit/Loss)</h4>
                                <p className="text-muted-foreground">Your "paper" profit or loss on the assets you still hold. It's the difference between what they are worth now and what you paid for them.<br/><code className="text-xs">Formula: Market Value - Cost Basis</code></p>
                            </div>
                            <div>
                                <h4 className="font-semibold">Total P/L (Profit/Loss)</h4>
                                <p className="text-muted-foreground">The complete picture of your profit or loss, combining both realized (from sales) and unrealized (paper) gains/losses.<br/><code className="text-xs">Formula: Realized P/L + Unrealized P/L</code></p>
                            </div>
                             <div>
                                <h4 className="font-semibold">Performance</h4>
                                <p className="text-muted-foreground">The total percentage return on your entire original investment for this asset class, including the performance of shares you've already sold.<br/><code className="text-xs">Formula: (Total P/L / Original Purchase Value) × 100</code></p>
                            </div>
                             <div>
                                <h4 className="font-semibold">% of Portfolio (Donut Chart)</h4>
                                <p className="text-muted-foreground">This shows the allocation of your portfolio's value. It has two modes:</p>
                                <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
                                    <li><span className="font-semibold text-foreground">Market Value Mode:</span> Shows the percentage based on the current market value of what you own.</li>
                                    <li><span className="font-semibold text-foreground">Economic Value Mode:</span> Shows a broader view, including your realized gains. The value is calculated as <code className="text-xs">(Market Value + Realized P/L)</code>.</li>
                                </ul>
                            </div>
                             <div className="pt-2">
                                <h4 className="font-semibold">Total Row</h4>
                                <p className="text-muted-foreground">The "Total" row sums the numeric columns from the rows above it. The "Performance" percentage is then re-calculated based on the grand totals to provide a true weighted-average performance for your entire portfolio.</p>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Asset Type</TableHead>
                                    <TableHead className="text-right">Cost Basis</TableHead>
                                    <TableHead className="text-right">Market Value</TableHead>
                                    <TableHead className="text-right">Realized P/L</TableHead>
                                    <TableHead className="text-right">Unrealized P/L</TableHead>
                                    <TableHead className="text-right">Total P/L</TableHead>
                                    <TableHead className="text-right">Performance</TableHead>
                                    <TableHead className="text-right">% of Portfolio</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map(item => {
                                    const portfolioPercentage = totalPortfolioValue > 0 
                                      ? ((donutMode === 'market' ? item.marketValue : item.economicValue) / totalPortfolioValue)
                                      : 0;

                                    return (
                                    <TableRow key={item.type}>
                                        <TableCell className="font-medium">{item.type}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(item.costBasis)}</TableCell>
                                        <TableCell className="text-right font-mono font-bold">{formatCurrency(item.marketValue)}</TableCell>
                                        <TableCell className={cn("text-right font-mono", item.realizedPL >= 0 ? "text-green-500" : "text-destructive")}>{formatCurrency(item.realizedPL)}</TableCell>
                                        <TableCell className={cn("text-right font-mono", item.unrealizedPL >= 0 ? "text-green-500" : "text-destructive")}>{formatCurrency(item.unrealizedPL)}</TableCell>
                                        <TableCell className={cn("text-right font-mono flex items-center justify-end gap-1", item.totalPL >= 0 ? "text-green-500" : "text-destructive")}>
                                          {item.totalPL >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                          {formatCurrency(item.totalPL)}
                                        </TableCell>
                                        <TableCell className={cn("text-right font-mono", item.performancePct >= 0 ? "text-green-500" : "text-destructive")}>{formatPercent(item.performancePct)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatPercent(portfolioPercentage)}</TableCell>
                                    </TableRow>
                                )})}
                            </TableBody>
                            <TableFooter>
                                <TableRow className="bg-muted/50 font-bold">
                                    <TableCell>Total</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(totals.costBasis)}</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(totals.marketValue)}</TableCell>
                                    <TableCell className={cn("text-right font-mono", totals.realizedPL >= 0 ? "text-green-500" : "text-destructive")}>{formatCurrency(totals.realizedPL)}</TableCell>
                                    <TableCell className={cn("text-right font-mono", totals.unrealizedPL >= 0 ? "text-green-500" : "text-destructive")}>{formatCurrency(totals.unrealizedPL)}</TableCell>
                                    <TableCell className={cn("text-right font-mono flex items-center justify-end gap-1", totals.totalPL >= 0 ? "text-green-500" : "text-destructive")}>
                                        {totals.totalPL >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                        {formatCurrency(totals.totalPL)}
                                    </TableCell>
                                    <TableCell className={cn("text-right font-mono", totals.performancePct >= 0 ? "text-green-500" : "text-destructive")}>{formatPercent(totals.performancePct)}</TableCell>
                                    <TableCell className="text-right font-mono">{formatPercent(1)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <Tabs value={donutMode} onValueChange={(v) => setDonutMode(v as DonutMode)} className='mb-2'>
                           <TabsList>
                                <TabsTrigger value="market">Market Value</TabsTrigger>
                                <TabsTrigger value="economic">Economic Value</TabsTrigger>
                           </TabsList>
                        </Tabs>

                        <ChartContainer config={{}} className="aspect-square h-[250px] w-full">
                           {chartData.length > 0 ? (
                            <PieChart>
                                <Tooltip
                                    cursor={false}
                                    content={<ChartTooltipContent 
                                        hideLabel
                                        formatter={(value, name, props) => (
                                            <div className="flex flex-col">
                                                <span className="font-bold">{props.payload.name}</span>
                                                <span>{formatCurrency(props.payload.value as number)}</span>
                                                <span className="text-muted-foreground">{formatPercent((props.payload.payload as any).percentage / 100)} of portfolio</span>
                                            </div>
                                        )}
                                    />}
                                />
                                <Pie
                                    data={chartData} dataKey="value" nameKey="name"
                                    cx="50%" cy="50%" outerRadius={100} innerRadius={60}
                                    paddingAngle={2} labelLine={false}
                                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                                        const RADIAN = Math.PI / 180;
                                        const radius = innerRadius + (outerRadius - innerRadius) * 1.25;
                                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                        const percentage = (percent * 100).toFixed(0);
                                        if (parseInt(percentage) < 5) return null; // Don't render small labels

                                        return (
                                             <text x={x} y={y} fill="hsl(var(--foreground))" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-xs font-semibold">
                                                {`${chartData[index].name} (${percentage}%)`}
                                            </text>
                                        );
                                    }}
                                >
                                    {chartData.map((entry, index) => ( <Cell key={`cell-${index}`} fill={entry.fill} /> ))}
                                </Pie>
                            </PieChart>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-center h-full">
                                    <Info className="h-8 w-8 text-muted-foreground mb-2"/>
                                    <p className="text-sm text-muted-foreground">No data to display in chart.</p>
                                    <p className="text-xs text-muted-foreground">This may be because all assets have been sold.</p>
                                </div>
                            )}
                        </ChartContainer>
                         <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4 text-xs">
                            {chartData.map((entry, index) => (
                                <div key={`legend-${index}`} className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.fill }} />
                                    <span>{entry.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
