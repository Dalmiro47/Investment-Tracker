
"use client";

import { useState, useMemo, useEffect } from 'react';
import type { Investment, Transaction, YearFilter, TaxSettings } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Info, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent, toNum } from '@/lib/money';
import { aggregateByType, AggregatedSummary, YearTaxSummary } from '@/lib/portfolio';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TAX } from '@/lib/tax';


const CHART_COLORS = [
    'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
    'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(220 70% 50%)',
    'hsl(30 80% 55%)'
];

type DonutMode = 'market' | 'economic';
type YearViewMode = 'combined' | 'realized' | 'holdings';

interface TaxEstimateDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    taxSummary: YearTaxSummary | null;
    year: number;
    taxSettings: TaxSettings | null;
}

function TaxEstimateDialog({ isOpen, onOpenChange, taxSummary, year, taxSettings }: TaxEstimateDialogProps) {
    if (!taxSummary || !taxSettings) return null;

    const { capitalTaxResult: capital, cryptoTaxResult: crypto } = taxSummary;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                 <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Scale /> Estimated Taxes for {year}
                    </DialogTitle>
                    <DialogDescription>
                        This is an estimate for informational purposes only and not professional tax advice.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-sm py-4">
                    {/* Capital Gains */}
                    <div className="p-3 rounded-md bg-muted/50 border">
                        <h4 className="font-semibold mb-2">Capital Income (§20 EStG)</h4>
                        <div className="flex justify-between"><span className="text-muted-foreground">Total Capital Income</span> <span className="font-mono">{formatCurrency(capital.allowance + capital.taxableBase)}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground pl-2">Allowance Used</span> <span className="font-mono">- {formatCurrency(capital.allowanceUsed)}</span></div>
                        <div className="border-t my-1"></div>
                        <div className="flex justify-between font-medium"><span className="">Taxable Base</span> <span className="font-mono">{formatCurrency(capital.taxableBase)}</span></div>
                        <div className="border-t my-2"></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Base Tax ({formatPercent(TAX.abgeltungsteuer)})</span> <span className="font-mono">{formatCurrency(capital.baseTax)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Solidarity Surcharge</span> <span className="font-mono">{formatCurrency(capital.soli)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Church Tax</span> <span className="font-mono">{formatCurrency(capital.church)}</span></div>
                        <div className="flex justify-between font-bold mt-1"><span className="">Total Capital Tax</span> <span className="font-mono">{formatCurrency(capital.total)}</span></div>
                    </div>

                    {/* Crypto */}
                    <div className="p-3 rounded-md bg-muted/50 border">
                        <h4 className="font-semibold mb-2">Crypto Private Sales (§23 EStG)</h4>
                         <div className="flex justify-between"><span className="text-muted-foreground">Short-term Gains</span> <span className="font-mono">{formatCurrency(crypto.thresholdUsed + crypto.taxableBase)}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground pl-2">Threshold Used</span> <span className="font-mono">- {formatCurrency(crypto.thresholdUsed)}</span></div>
                         <div className="border-t my-1"></div>
                        <div className="flex justify-between font-medium"><span className="">Taxable Base</span> <span className="font-mono">{formatCurrency(crypto.taxableBase)}</span></div>
                        <div className="border-t my-2"></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Income Tax ({formatPercent(taxSettings.cryptoMarginalRate)})</span> <span className="font-mono">{formatCurrency(crypto.incomeTax)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Solidarity Surcharge</span> <span className="font-mono">{formatCurrency(crypto.soli)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Church Tax</span> <span className="font-mono">{formatCurrency(crypto.church)}</span></div>
                        <div className="flex justify-between font-bold mt-1"><span className="">Total Crypto Tax</span> <span className="font-mono">{formatCurrency(crypto.total)}</span></div>
                    </div>
                    
                    {/* Grand Total */}
                    <div className="pt-2 border-t mt-2">
                            <div className="flex justify-between font-bold text-base text-primary"><span className="">Grand Total Estimated Tax</span> <span className="font-mono">{formatCurrency(taxSummary.grandTotal)}</span></div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

interface PortfolioSummaryProps {
    investments: Investment[];
    transactionsMap: Record<string, Transaction[]>;
    sellYears: number[];
    isTaxView: boolean;
    taxSettings: TaxSettings | null;
    yearFilter: YearFilter;
    onYearFilterChange: (filter: YearFilter) => void;
}

export default function PortfolioSummary({ 
    investments, 
    transactionsMap, 
    sellYears, 
    isTaxView, 
    taxSettings,
    yearFilter,
    onYearFilterChange,
}: PortfolioSummaryProps) {
    
    const [donutMode, setDonutMode] = useState<DonutMode>('market');
    const [isTaxEstimateOpen, setIsTaxEstimateOpen] = useState(false);
    
    const handleYearChange = (value: string) => {
        if (value === 'all') {
            onYearFilterChange({ kind: 'all' });
        } else {
            const currentMode = yearFilter.kind === 'year' ? yearFilter.mode : 'combined';
            onYearFilterChange({ kind: 'year', year: parseInt(value), mode: currentMode });
        }
    };

    const handleModeChange = (mode: YearViewMode) => {
        if (yearFilter.kind === 'year') {
            onYearFilterChange({ ...yearFilter, mode });
        }
    };

    const summaryData: AggregatedSummary | null = useMemo(() => {
        if (investments.length === 0 || Object.keys(transactionsMap).length === 0) {
            return null;
        }
        return aggregateByType(investments, transactionsMap, yearFilter, isTaxView ? taxSettings : null);
    }, [investments, transactionsMap, yearFilter, isTaxView, taxSettings]);
    
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

    const { rows, totals, taxSummary } = summaryData;
    const totalPortfolioValue = donutMode === 'market' ? totals.marketValue : totals.economicValue;
    const showTaxEstimatorButton = isTaxView && taxSummary && yearFilter.kind === 'year';

    return (
        <>
        <Card>
            <CardHeader>
               <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle className="font-headline text-2xl">Portfolio Summary</CardTitle>
                        <CardDescription>An overview of your current portfolio performance.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                         <Select onValueChange={handleYearChange} value={yearFilter.kind === 'year' ? String(yearFilter.year) : 'all'}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Select Tax Year" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Years</SelectItem>
                                {sellYears.map(year => (
                                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
                                        <h4 className="font-semibold">Tax Year Filter &amp; View Mode</h4>
                                        <p className="text-muted-foreground">The filter restricts calculations to a specific year. The view mode changes which investments are included.</p>
                                        <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
                                            <li><span className="font-semibold text-foreground">Combined:</span> (Default) Shows all currently open positions PLUS any positions that had a sale in the selected year. Realized P/L is year-specific.</li>
                                            <li><span className="font-semibold text-foreground">Realized (Tax):</span> Shows ONLY positions that had a sale in the selected year. This is a pure tax-reporting view.</li>
                                            <li><span className="font-semibold text-foreground">Holdings:</span> Shows ONLY currently open positions. Realized P/L is shown as zero.</li>
                                        </ul>
                                    </div>
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
                                        <p className="text-muted-foreground">Your "locked-in" profit or loss from sales. This value is filtered by the selected "Tax Year" and "View Mode". <br/><code className="text-xs">Formula: Sum of (Sell Price - Original Purchase Price) × Quantity Sold</code></p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold">Unrealized P/L (Profit/Loss)</h4>
                                        <p className="text-muted-foreground">Your "paper" profit or loss on the assets you still hold. It's the difference between what they are worth now and what you paid for them.<br/><code className="text-xs">Formula: Market Value - Cost Basis</code></p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold">Total P/L (Profit/Loss)</h4>
                                        <p className="text-muted-foreground">The complete picture of your profit or loss, combining the (filtered) realized gains/losses with the current unrealized gains/losses.<br/><code className="text-xs">Formula: Realized P/L + Unrealized P/L</code></p>
                                    </div>
                                    <div>
                                       <h4 className="font-semibold">Performance</h4>
                                       <p className="text-muted-foreground">The total percentage return. This is calculated against the total original purchase value of the assets included in the current view to give a true measure of performance for that selection.</p>
                                       <p className="text-muted-foreground mt-1"><code className="text-xs">Formula: (Total P/L / Total Original Purchase Value) × 100</code></p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold">% of Portfolio (Donut Chart)</h4>
                                        <p className="text-muted-foreground">This shows the allocation of your portfolio's value. It has two modes:</p>
                                        <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
                                            <li><span className="font-semibold text-foreground">Market Value Mode:</span> Shows the percentage based on the current market value of what you own.</li>
                                            <li><span className="font-semibold text-foreground">Economic Value Mode:</span> Shows a broader view, including your realized gains (note: this uses all-time realized gains, not the filtered year). The value is calculated as <code className="text-xs">(Market Value + Realized P/L)</code>.</li>
                                        </ul>
                                    </div>
                                    <div className="pt-2">
                                        <h4 className="font-semibold">Total Row</h4>
                                        <p className="text-muted-foreground">The "Total" row sums the numeric columns from the rows above it. The "Performance" percentage is then re-calculated based on the grand totals to provide a true weighted-average performance for your entire portfolio.</p>
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2 mb-4">
                    {yearFilter.kind === 'year' && (
                        <Tabs value={yearFilter.mode} onValueChange={(v) => handleModeChange(v as YearViewMode)}>
                            <TabsList>
                                <TabsTrigger value="combined">Combined</TabsTrigger>
                                <TabsTrigger value="realized">Realized (Tax)</TabsTrigger>
                                <TabsTrigger value="holdings">Holdings</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    )}
                    <div className="flex-grow"/>
                    {showTaxEstimatorButton && (
                        <Button variant="outline" size="sm" onClick={() => setIsTaxEstimateOpen(true)}>
                            <Scale className="mr-2 h-4 w-4" />
                            View Tax Estimate for {yearFilter.year}
                        </Button>
                    )}
                </div>
                 <p className="text-xs text-muted-foreground mt-1">
                    Realized P/L reflects the selected year and view mode. Market & unrealized values are based on current prices.
                </p>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 overflow-x-auto">
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
                    <div className="flex flex-col items-center justify-center lg:col-span-1">
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
                                        if (parseInt(percentage) < 5) return null;

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
        {yearFilter.kind === 'year' && (
            <TaxEstimateDialog 
                isOpen={isTaxEstimateOpen}
                onOpenChange={setIsTaxEstimateOpen}
                taxSummary={taxSummary}
                year={yearFilter.year}
                taxSettings={taxSettings}
            />
        )}
        </>
    );
}
