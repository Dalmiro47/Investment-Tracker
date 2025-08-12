
"use client";

import { useMemo } from 'react';
import type { Investment } from '@/lib/types';
import { summarizeByType } from '@/lib/utils/summary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent } from '@/lib/money';


const CHART_COLORS = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
    'hsl(220 70% 50%)',
    'hsl(30 80% 55%)'
];

export default function PortfolioSummary({ investments }: { investments: Investment[] }) {
    const { summary, totals } = useMemo(() => summarizeByType(investments), [investments]);

    const chartData = useMemo(() => {
        // Chart should represent the composition of the *current active* portfolio value.
        const activeInvestments = investments.filter(inv => inv.status === 'Active');
        const activeSummary = summarizeByType(activeInvestments);

        return Object.values(activeSummary.summary)
            .filter(item => (item.currentValue - item.realizedProceeds) > 0)
            .map(item => ({
                name: item.type,
                value: item.currentValue - item.realizedProceeds,
                portfolioPercentage: item.portfolioPercentage,
                fill: CHART_COLORS[Object.keys(summary).indexOf(item.type) % CHART_COLORS.length]
            }))
            .sort((a, b) => b.value - a.value);
    }, [investments, summary]);

    if (investments.length === 0) {
        return null;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline text-2xl">Portfolio Summary</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Asset Type</TableHead>
                                    <TableHead className="text-right">Total Cost</TableHead>
                                    <TableHead className="text-right">Total Value</TableHead>
                                    <TableHead className="text-right">Total P/L</TableHead>
                                    <TableHead className="text-right">Performance</TableHead>
                                    <TableHead className="text-right">% of Portfolio</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {Object.values(summary).map(item => (
                                    <TableRow key={item.type}>
                                        <TableCell className="font-medium">{item.type}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(item.totalCost)}</TableCell>
                                        <TableCell className="text-right font-mono font-bold">{formatCurrency(item.currentValue)}</TableCell>
                                        <TableCell className={cn("text-right font-mono flex items-center justify-end gap-1", item.gainLoss >= 0 ? "text-green-500" : "text-destructive")}>
                                          {item.gainLoss >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                          {formatCurrency(item.gainLoss)}
                                        </TableCell>
                                        <TableCell className={cn("text-right font-mono", item.gainLossPercent >= 0 ? "text-green-500" : "text-destructive")}>{formatPercent(item.gainLossPercent / 100)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatPercent(item.portfolioPercentage / 100)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow className="bg-muted/50 font-bold">
                                    <TableCell>Total</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(totals.totalCost)}</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(totals.currentValue)}</TableCell>
                                    <TableCell className={cn("text-right font-mono flex items-center justify-end gap-1", totals.gainLoss >= 0 ? "text-green-500" : "text-destructive")}>
                                        {totals.gainLoss >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                        {formatCurrency(totals.gainLoss)}
                                    </TableCell>
                                    <TableCell className={cn("text-right font-mono", totals.gainLossPercent >= 0 ? "text-green-500" : "text-destructive")}>{formatPercent(totals.gainLossPercent / 100)}</TableCell>
                                    <TableCell className="text-right font-mono">{formatPercent(1)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <ChartContainer config={{}} className="aspect-square h-[250px] w-full">
                            <PieChart>
                                <Tooltip
                                    cursor={false}
                                    content={<ChartTooltipContent hideLabel nameKey="name" />}
                                    formatter={(value, name, props) => (
                                        <div className="flex flex-col">
                                            <span className="font-bold">{props.payload.name}</span>
                                            <span>{formatCurrency(props.payload.value as number)}</span>
                                            <span className="text-muted-foreground">{formatPercent((props.payload.payload as any).portfolioPercentage / 100)} of portfolio</span>
                                        </div>
                                    )}
                                />
                                <Pie
                                    data={chartData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={100}
                                    innerRadius={60}
                                    paddingAngle={2}
                                    labelLine={false}
                                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                                        const RADIAN = Math.PI / 180;
                                        const radius = innerRadius + (outerRadius - innerRadius) * 1.25;
                                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                        const percentage = (percent * 100).toFixed(0);

                                        return (
                                             <text x={x} y={y} fill="hsl(var(--foreground))" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-xs font-semibold">
                                                {`${chartData[index].name} (${percentage}%)`}
                                            </text>
                                        );
                                    }}
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Pie>
                            </PieChart>
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
