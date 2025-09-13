
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getEtfPlan } from '@/lib/firestore.etfPlan';
import type { ETFPlan, ETFComponent, SimulationRows, PlanRowDrift } from '@/lib/types.etf';
import { format, parseISO, getYear } from 'date-fns';
import { formatCurrency, formatPercent } from '@/lib/money';
import { getStartMonth } from '@/lib/date-helpers';
import { useAutoRefreshEtfHistory } from '@/hooks/use-auto-refresh-etf';
import { xirr } from '@/lib/xirr';

import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DriftTable from '@/components/etf/DriftTable';
import { PerformanceTable } from '@/components/etf/PerformanceTable';
import { ArrowLeft, RefreshCw, Play, Loader2, ArrowDownToLine, AlertTriangle, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PortfolioStackedChart from '@/components/etf/PortfolioStackedChart';
import PerformanceSummary from '@/components/etf/PerformanceSummary';

export const runtime = 'nodejs';

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
    const [simData, setSimData] = useState<SimulationRows | null>(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [missingPrices, setMissingPrices] = useState<MissingPrice[]>([]);
    const [isMissingPricesDialogOpen, setIsMissingPricesDialogOpen] = useState(false);

    useAutoRefreshEtfHistory({ userId: user?.uid });

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
        setSimData(null); // Clear previous results
        toast({ title: 'Running simulation...' });
        try {
            const plainPlan = {
                id: plan.id,
                title: plan.title,
                baseCurrency: plan.baseCurrency,
                monthContribution: plan.monthContribution,
                startDate: plan.startDate,
                startMonth: plan.startMonth,
                feePct: plan.feePct,
                rebalanceOnContribution: plan.rebalanceOnContribution,
                contributionSteps: plan.contributionSteps ?? [],
            };
            const res = await fetch('/api/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                cache: 'no-store',
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


    const effectiveDriftRows = useMemo(() => {
        if (!simData?.drift || simData.drift.length === 0) return [];
        let end = simData.drift.length - 1;
        while (end >= 0 && (simData.drift[end]?.portfolioValue ?? 0) === 0) end--;
        const baseRows = simData.drift.slice(0, end + 1);

        if (yearFilter === 'all') {
            return baseRows;
        }
        return baseRows.filter(row => getYear(parseISO(row.date)) === parseInt(yearFilter));
    }, [simData, yearFilter]);

    const perfRowsPeriod = useMemo(() => {
      if (!simData?.performance) return [];
      return yearFilter === 'all'
        ? simData.performance
        : simData.performance.filter(r => r.dateKey.slice(0,4) === yearFilter);
    }, [simData, yearFilter]);

    const kpis = useMemo(() => {
      if (effectiveDriftRows.length === 0 || !simData || perfRowsPeriod.length === 0) return null;

      // Simple % (your existing logic)
      const firstRowInPeriod = effectiveDriftRows[0];
      const before = simData.drift.filter(row => row.date < firstRowInPeriod.date);
      const valueBeforePeriod = before[before.length - 1]?.portfolioValue ?? 0;

      const lastRow = effectiveDriftRows[effectiveDriftRows.length - 1];
      const totalContributions = effectiveDriftRows.reduce((sum, row) => sum + row.contribution, 0);
      const totalFees = effectiveDriftRows.reduce((sum, row) => sum + row.fees, 0);
      const currentValue = lastRow.portfolioValue;

      const gainLoss = currentValue - valueBeforePeriod - totalContributions;
      const basis = valueBeforePeriod + totalContributions;
      const performance = basis > 0 ? gainLoss / basis : 0;

      // XIRR (money-weighted, annualized)
      const feesByMonth = new Map<string, number>();
      effectiveDriftRows.forEach(dr => {
        const m = dr.date.slice(0,7);
        feesByMonth.set(m, (feesByMonth.get(m) ?? 0) + (dr.fees ?? 0));
      });

      const cf = perfRowsPeriod.map(r => {
        const contrib = r.perEtf.reduce((s, e) => s + Number(e.contribThisMonth), 0);
        const fees = feesByMonth.get(r.dateKey) ?? 0;
        return { date: new Date(`${r.dateKey}-28`), amount: -(contrib + fees) };
      });
      // terminal inflow at period end
      if (currentValue > 0) cf.push({ date: new Date(`${lastRow.date.slice(0,10)}`), amount: currentValue });
      const xirrValue =
        (cf.some(c => c.amount < 0) && cf.some(c => c.amount > 0)) ? xirr(cf) : null;

      return { totalContributions, totalFees, currentValue, gainLoss, performance, xirrValue };
    }, [effectiveDriftRows, simData, perfRowsPeriod]);


    const availableYears = useMemo(() => {
        if (!simData?.drift || simData.drift.length === 0) return [];
        const years = new Set<number>();
        simData.drift.forEach(row => years.add(getYear(parseISO(row.date))));
        return Array.from(years).sort((a, b) => b - a);
    }, [simData]);

    if (loading) {
        return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
    }

    if (!plan) {
        return <div>Plan not found.</div>
    }

    const planStartMonth = getStartMonth(plan);

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
                        <p className="text-muted-foreground">Simulation from {format(parseISO(`${planStartMonth}-01`), 'dd MMM yyyy')} to present.</p>
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
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                              <CardTitle className={kpis.performance >= 0 ? "text-green-500" : "text-destructive"}>
                                {formatPercent(kpis.performance)}{kpis.xirrValue != null ? ` / ${formatPercent(kpis.xirrValue)}` : ''}
                              </CardTitle>
                              <CardDescription>Simple % / XIRR ({yearFilter === 'all' ? 'All Time' : yearFilter})</CardDescription>
                            </div>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon"><Info className="h-4 w-4" /></Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Simple % vs XIRR — what’s the difference?</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-3 text-sm">
                                  <p><b>Simple %</b> = (End Value − (Contributions + Fees)) ÷ (Contributions + Fees) for the selected period.</p>
                                  <p><b>XIRR</b> is the money-weighted, annualized return that accounts for <i>when</i> each contribution/fee happened. We build monthly cash flows
                                     as outflows (contribution + fee) and a final inflow equal to the end value.</p>
                                  <p>They differ whenever contributions are spread over time (i.e., regular investing). XIRR captures compounding with cash-flow timing; Simple % is a quick ratio.</p>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </CardHeader>
                        </Card>
                    </div>
                )}

                {simData && plan && effectiveDriftRows.length > 0 && (
                    <PortfolioStackedChart
                        rows={effectiveDriftRows}
                        components={plan.components}
                    />
                )}
                
                 {simData && plan && (
                    <Tabs defaultValue="performance" className="mt-6">
                        <TabsList>
                            <TabsTrigger value="performance">Performance</TabsTrigger>
                            <TabsTrigger value="drift">Drift</TabsTrigger>
                        </TabsList>
                        <TabsContent value="performance">
                            {simData && (
                                <PerformanceSummary
                                  perfRows={perfRowsPeriod}
                                  driftRows={effectiveDriftRows}
                                  components={plan.components}
                                  showPerEtf={true}
                                  showPortfolioCards={false}
                                  showGrowthBar={false}
                                />
                            )}
                            <PerformanceTable
                                rows={simData.performance}
                                components={plan.components}
                                availableYears={availableYears}
                                yearFilter={yearFilter}
                                onYearFilterChange={setYearFilter}
                             />
                        </TabsContent>
                        <TabsContent value="drift">
                            <DriftTable rows={effectiveDriftRows} components={plan.components} availableYears={availableYears} yearFilter={yearFilter} onYearFilterChange={setYearFilter} />
                        </TabsContent>
                    </Tabs>
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
