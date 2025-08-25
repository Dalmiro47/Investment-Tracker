
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getEtfPlan } from '@/lib/firestore.etfPlan';
import type { ETFPlan, ETFComponent } from '@/lib/types.etf';
import type { PlanRow } from '@/lib/etf/engine';
import { format, parseISO, getYear } from 'date-fns';
import { formatCurrency, formatPercent } from '@/lib/money';

import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, Legend } from 'recharts';
import { ArrowLeft, RefreshCw, Play, Loader2, ArrowDownToLine, Info, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const runtime = 'nodejs';

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

interface MissingPrice {
    month: string;
    missingFor: string[];
}

interface ManualPriceFormProps {
    uid: string;
    planId: string;
    symbol: string;
    month: string;
    onSave: () => void;
}

function ManualPriceForm({ uid, planId, symbol, month, onSave }: ManualPriceFormProps) {
    const { toast } = useToast();
    const [price, setPrice] = useState('');
    const [currency, setCurrency] = useState('EUR');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!price || Number(price) <= 0) {
            toast({ variant: 'destructive', title: 'Invalid Price', description: 'Please enter a positive number for the price.' });
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch('/api/etf/prices/override', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid, planId, symbol, month, close: Number(price), currency }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data?.error || 'Failed to save manual price.');
            toast({ title: 'Price Saved', description: `Manual price for ${symbol} in ${month} has been saved.` });
            onSave();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="flex items-center gap-2 mt-1 pl-4">
            <Input
                type="number"
                step="0.01"
                placeholder="Close Price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-8 w-24"
                disabled={isSaving}
            />
            <Select value={currency} onValueChange={setCurrency} disabled={isSaving}>
                <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
            </Select>
            <Button type="submit" size="sm" className="h-8" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
        </form>
    );
}


export default function PlanDetailPage() {
    const params = useParams<{ planId: string }>();
    const planId = params?.planId;
    const { user } = useAuth();
    const { toast } = useToast();
    const [plan, setPlan] = useState<(ETFPlan & { components: ETFComponent[] }) | null>(null);
    const [simData, setSimData] = useState<PlanRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [missingPrices, setMissingPrices] = useState<MissingPrice[]>([]);
    const [isMissingPricesDialogOpen, setIsMissingPricesDialogOpen] = useState(false);

    useEffect(() => {
        if (user && planId) {
            const fetchPlan = async () => {
                setLoading(true);
                const fetchedPlan = await getEtfPlan(user.uid, planId);
                setPlan(fetchedPlan);
                setLoading(false);
            };
            fetchPlan();
        }
    }, [user, planId]);

    const handleRefresh = async () => {
        if (!user || !plan) return;
        setIsRefreshing(true);
        toast({ title: 'Refreshing price data...', description: 'This may take a moment.' });
        try {
            const res = await fetch('/api/refresh-prices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: user.uid,
                    planId: plan.id,
                    components: plan.components,
                    startDate: plan.startDate
                }),
            });
            const result = await res.json();
            if (result.ok) {
                toast({ title: 'Success', description: 'Price data has been updated.' });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Refresh failed', description: e.message ?? 'Unknown error' });
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleRun = async () => {
        if (!user || !plan) return;
        setIsRunning(true);
        setSimData([]); // Clear previous results
        toast({ title: 'Running simulation...' });
        try {
            const plainPlan = {
                id: plan.id,
                title: plan.title,
                baseCurrency: plan.baseCurrency,
                monthContribution: plan.monthContribution,
                startDate: plan.startDate,
                feePct: plan.feePct,
                rebalanceOnContribution: plan.rebalanceOnContribution,
                contributionSteps: plan.contributionSteps ?? [],
            };
            const res = await fetch('/api/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: user.uid, plan: plainPlan, components: plan.components }),
            });
            const data = await res.json();
            
            if (!res.ok) {
                if (data?.code === 'MISSING_PRICES') {
                    setMissingPrices(data.missing);
                    setIsMissingPricesDialogOpen(true);
                    toast({
                        variant: 'destructive',
                        title: 'Missing Prices',
                        description: 'Simulation cannot run until all price gaps are filled.'
                    });
                    return; // Stop execution
                }
                throw new Error(data.message || data.error || 'Simulation failed due to an unknown server error.');
            }

            setSimData(data.rows);
            toast({ title: 'Simulation complete.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Simulation failed', description: e.message ?? 'Unknown error' });
        } finally {
            setIsRunning(false);
        }
    };
    
    const handleManualPriceSaved = (month: string, symbol: string) => {
        const updatedMissing = missingPrices.map(m => {
            if (m.month === month) {
                return { ...m, missingFor: m.missingFor.filter(s => s !== symbol) };
            }
            return m;
        }).filter(m => m.missingFor.length > 0);

        setMissingPrices(updatedMissing);
        
        if (updatedMissing.length === 0) {
            setIsMissingPricesDialogOpen(false);
            toast({ title: 'All prices filled!', description: 'Re-running simulation automatically.' });
            handleRun();
        }
    };


    const effectiveRows = useMemo(() => {
        if (!simData || simData.length === 0) return [];
        let end = simData.length - 1;
        while (end >= 0 && (simData[end]?.portfolioValue ?? 0) === 0) end--;
        const baseRows = simData.slice(0, end + 1);

        if (yearFilter === 'all') {
            return baseRows;
        }
        return baseRows.filter(row => getYear(parseISO(row.date)) === parseInt(yearFilter));
    }, [simData, yearFilter]);

    const kpis = useMemo(() => {
        if (effectiveRows.length === 0) return null;
        
        const firstRowInPeriod = effectiveRows[0];
        const allSimDataBeforePeriod = simData.filter(row => row.date < firstRowInPeriod.date);
        const valueBeforePeriod = allSimDataBeforePeriod[allSimDataBeforePeriod.length - 1]?.portfolioValue ?? 0;
        
        const lastRow = effectiveRows[effectiveRows.length - 1];
        const totalContributions = effectiveRows.reduce((sum, row) => sum + row.contribution, 0);
        const totalFees = effectiveRows.reduce((sum, row) => sum + row.fees, 0);
        const currentValue = lastRow.portfolioValue;

        const gainLoss = currentValue - valueBeforePeriod - totalContributions;
        const basis = valueBeforePeriod + totalContributions;
        const performance = basis > 0 ? gainLoss / basis : 0;
        
        return { totalContributions, totalFees, currentValue, gainLoss, performance };
    }, [effectiveRows, simData]);

    const chartData = useMemo(() => {
        return effectiveRows.map(row => {
            const chartRow: any = {
                date: format(parseISO(row.date), 'MMM yy'),
                'Portfolio Value': row.portfolioValue,
            };
            plan?.components.forEach(comp => {
                const pos = row.positions.find(p => p.symbol === comp.ticker);
                chartRow[comp.name] = pos?.valueEUR ?? 0;
            });
            return chartRow;
        });
    }, [effectiveRows, plan]);

    const availableYears = useMemo(() => {
        if (simData.length === 0) return [];
        const years = new Set<number>();
        simData.forEach(row => years.add(getYear(parseISO(row.date))));
        return Array.from(years).sort((a, b) => b - a);
    }, [simData]);

    if (loading) {
        return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
    }

    if (!plan) {
        return <div>Plan not found.</div>
    }

    return (
        <div className="min-h-screen w-full bg-background">
            <DashboardHeader isTaxView={false} onTaxViewChange={() => { }} onTaxSettingsClick={() => { }} />
            <main className="p-4 sm:p-6 lg:p-8">
                <div className="flex items-center gap-4 mb-6">
                    <Link href="/etf">
                        <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold font-headline">{plan.title}</h1>
                        <p className="text-muted-foreground">Simulation from {format(parseISO(plan.startDate), 'dd MMM yyyy')} to present.</p>
                    </div>
                </div>

                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle>Controls</CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-4">
                        <Button onClick={handleRefresh} disabled={isRefreshing || isRunning}>
                            {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh Price Data
                        </Button>
                        <Button onClick={handleRun} disabled={isRunning || isRefreshing}>
                            {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                            Run Simulation
                        </Button>
                    </CardContent>
                </Card>

                {kpis && (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-6">
                        <Card><CardHeader><CardTitle>{formatCurrency(kpis.totalContributions)}</CardTitle><CardDescription>Total Contributions ({yearFilter === 'all' ? 'All Time' : yearFilter})</CardDescription></CardHeader></Card>
                        <Card><CardHeader><CardTitle>{formatCurrency(kpis.totalFees)}</CardTitle><CardDescription>Total Fees Paid ({yearFilter === 'all' ? 'All Time' : yearFilter})</CardDescription></CardHeader></Card>
                        <Card><CardHeader><CardTitle>{formatCurrency(kpis.currentValue)}</CardTitle><CardDescription>End of Period Value</CardDescription></CardHeader></Card>
                        <Card><CardHeader><CardTitle className={kpis.gainLoss >= 0 ? "text-green-500" : "text-destructive"}>{formatCurrency(kpis.gainLoss)}</CardTitle><CardDescription>Gain / Loss ({yearFilter === 'all' ? 'All Time' : yearFilter})</CardDescription></CardHeader></Card>
                        <Card><CardHeader><CardTitle className={kpis.performance >= 0 ? "text-green-500" : "text-destructive"}>{formatPercent(kpis.performance)}</CardTitle><CardDescription>Performance ({yearFilter === 'all' ? 'All Time' : yearFilter})</CardDescription></CardHeader></Card>
                    </div>
                )}

                {effectiveRows.length > 0 && (
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle>Portfolio Value Over Time</CardTitle>
                        </CardHeader>
                        <CardContent className="h-[400px]">
                            <ChartContainer config={{}} className="w-full h-full">
                                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis tickFormatter={(value) => formatCurrency(value as number)} />
                                    <RechartsTooltip content={<ChartTooltipContent formatter={(value, name) => <div>{name}: {formatCurrency(value as number)}</div>} />} />
                                    <Legend />
                                    {plan.components.map((comp, i) => (
                                        <Area key={comp.id} type="monotone" dataKey={comp.name} stackId="1" stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.6} />
                                    ))}
                                </AreaChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                )}

                {effectiveRows.length > 0 && (
                    <Card>
                        <CardHeader className="flex flex-row justify-between items-center">
                            <div className="flex items-center gap-2">
                                <div>
                                    <CardTitle>Monthly Simulation Details</CardTitle>
                                    <CardDescription>Breakdown of portfolio evolution month by month.</CardDescription>
                                </div>
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="ghost" size="icon"><Info className="h-4 w-4" /></Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>Simulation Column Explanations</DialogTitle>
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
                                <Select value={yearFilter} onValueChange={setYearFilter}>
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
                                        {plan.components.map(c => <TableHead key={c.id} className="text-right">{c.name} Value</TableHead>)}
                                        {plan.components.map(c => <TableHead key={c.id} className="text-right">{c.name} Drift</TableHead>)}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {effectiveRows.map(row => (
                                        <TableRow key={row.date}>
                                            <TableCell>{format(parseISO(row.date), 'MMM yyyy')}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(row.contribution)}</TableCell>
                                            <TableCell className="text-right font-mono font-bold">{formatCurrency(row.portfolioValue)}</TableCell>
                                            {plan.components.map(comp => {
                                                const pos = row.positions.find(p => p.symbol === comp.ticker);
                                                return <TableCell key={comp.id} className="text-right font-mono">{formatCurrency(pos?.valueEUR ?? 0)}</TableCell>
                                            })}
                                            {plan.components.map(comp => {
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
                )}
            </main>

            <Dialog open={isMissingPricesDialogOpen} onOpenChange={setIsMissingPricesDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive" /> Manual Input Required</DialogTitle>
                        <DialogDescription>
                            The simulation cannot run because price data is missing for some months.
                            Please provide a month-end closing price for the items below.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 max-h-[60vh] overflow-y-auto">
                        <ul className="space-y-4">
                            {missingPrices.map(item => (
                                <li key={item.month}>
                                    <p className="font-semibold text-foreground">{format(parseISO(`${item.month}-01`), 'MMMM yyyy')}</p>
                                    <ul className="space-y-2 mt-1">
                                        {item.missingFor.map(symbol => (
                                            <li key={symbol} className="flex items-center justify-between">
                                                <Label htmlFor={`${item.month}-${symbol}`} className="font-mono text-sm">{symbol}</Label>
                                                {user && plan && (
                                                    <ManualPriceForm
                                                        uid={user.uid}
                                                        planId={plan.id}
                                                        symbol={symbol}
                                                        month={item.month}
                                                        onSave={() => handleManualPriceSaved(item.month, symbol)}
                                                    />
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    </div>
                     <DialogFooter>
                        <Button variant="outline" onClick={() => setIsMissingPricesDialogOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    )
}
