
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getEtfPlan } from '@/lib/firestore.etfPlan';
import { refreshEtfData, runPlan } from '@/app/actions/etf';
import type { ETFPlan, ETFComponent } from '@/lib/types.etf';
import type { PlanRow } from '@/lib/etf/engine';
import { format, parseISO } from 'date-fns';
import { formatCurrency, formatPercent, toNum } from '@/lib/money';

import DashboardHeader from '@/components/dashboard-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, Legend } from 'recharts';
import { ArrowLeft, RefreshCw, Play, Loader2, ArrowDownToLine } from 'lucide-react';

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function PlanDetailPage({ params: { planId } }: { params: { planId: string } }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [plan, setPlan] = useState<(ETFPlan & { components: ETFComponent[] }) | null>(null);
    const [simData, setSimData] = useState<PlanRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isRunning, setIsRunning] = useState(false);

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
            const result = await refreshEtfData(user.uid, plan.id, plan.components, plan.startDate);
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
        toast({ title: 'Running simulation...' });
        try {
             // Create a plain object for the server action, excluding complex types like Timestamps
            const plainPlan: ETFPlan = {
                id: plan.id,
                title: plan.title,
                baseCurrency: plan.baseCurrency,
                monthContribution: plan.monthContribution,
                startDate: plan.startDate,
                feePct: plan.feePct,
                rebalanceOnContribution: plan.rebalanceOnContribution,
            };
            const result = await runPlan(user.uid, plainPlan, plan.components);
            setSimData(result);
            toast({ title: 'Simulation complete.' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Simulation failed', description: e.message ?? 'Unknown error' });
        } finally {
            setIsRunning(false);
        }
    };
    
    const kpis = useMemo(() => {
        if (simData.length === 0) return null;
        const lastRow = simData[simData.length - 1];
        const totalContributions = simData.reduce((sum, row) => sum + row.contribution, 0);
        const totalFees = simData.reduce((sum, row) => sum + row.fees, 0);
        const currentValue = lastRow.portfolioValue;
        const gainLoss = currentValue - totalContributions;
        const performance = totalContributions > 0 ? gainLoss / totalContributions : 0;
        return { totalContributions, totalFees, currentValue, gainLoss, performance };
    }, [simData]);

    const chartData = useMemo(() => {
        return simData.map(row => {
            const chartRow: any = {
                date: format(parseISO(row.date), 'MMM yy'),
                'Portfolio Value': toNum(row.portfolioValue),
            };
            plan?.components.forEach(comp => {
                const pos = row.positions.find(p => p.symbol === comp.ticker);
                chartRow[comp.name] = toNum(pos?.valueEUR ?? 0);
            });
            return chartRow;
        });
    }, [simData, plan]);
    
    if (loading) {
        return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin"/></div>
    }

    if (!plan) {
        return <div>Plan not found.</div>
    }

    return (
        <div className="min-h-screen w-full bg-background">
            <DashboardHeader isTaxView={false} onTaxViewChange={()=>{}} onTaxSettingsClick={()=>{}} />
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
                            {isRefreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Refresh Price Data
                        </Button>
                        <Button onClick={handleRun} disabled={isRunning || isRefreshing}>
                            {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Play className="mr-2 h-4 w-4" />}
                            Run Simulation
                        </Button>
                    </CardContent>
                </Card>

                {kpis && (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-6">
                        <Card><CardHeader><CardTitle>{formatCurrency(kpis.totalContributions)}</CardTitle><CardDescription>Total Contributions</CardDescription></CardHeader></Card>
                        <Card><CardHeader><CardTitle>{formatCurrency(kpis.totalFees)}</CardTitle><CardDescription>Total Fees Paid</CardDescription></CardHeader></Card>
                        <Card><CardHeader><CardTitle>{formatCurrency(kpis.currentValue)}</CardTitle><CardDescription>Current Portfolio Value</CardDescription></CardHeader></Card>
                        <Card><CardHeader><CardTitle className={kpis.gainLoss >= 0 ? "text-green-500" : "text-destructive"}>{formatCurrency(kpis.gainLoss)}</CardTitle><CardDescription>Total Gain / Loss</CardDescription></CardHeader></Card>
                        <Card><CardHeader><CardTitle className={kpis.performance >= 0 ? "text-green-500" : "text-destructive"}>{formatPercent(kpis.performance)}</CardTitle><CardDescription>Overall Performance</CardDescription></CardHeader></Card>
                    </div>
                )}
                
                {simData.length > 0 && (
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

                {simData.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row justify-between items-center">
                        <div>
                            <CardTitle>Monthly Simulation Details</CardTitle>
                            <CardDescription>Breakdown of portfolio evolution month by month.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" disabled><ArrowDownToLine className="mr-2 h-4 w-4"/>Export CSV</Button>
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
                                {simData.map(row => (
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
        </div>
    )

}
