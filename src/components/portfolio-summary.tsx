"use client";

import { useState, useMemo, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import type { Investment, Transaction, YearFilter, TaxSettings, AggregatedSummary, ViewMode } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import { TrendingUp, TrendingDown, Info, Scale, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent, toNum } from '@/lib/money';
import { YearTaxSummary } from '@/lib/portfolio';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TAX, defaultCapitalAllowance, defaultCryptoThreshold } from '@/lib/tax';
import { Separator } from './ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { AuditExportButton } from './tax/AuditExportButton';


const CHART_COLORS = [
    'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
    'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(220 70% 50%)',
    'hsl(30 80% 55%)'
];

type DonutMode = 'market' | 'economic';

interface TaxEstimateDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    taxSummary: YearTaxSummary | null;
    year: number;
    taxSettings: TaxSettings | null;
    futuresTransactions?: Transaction[];
}

function TaxEstimateDialog({ isOpen, onOpenChange, taxSummary, year, taxSettings, futuresTransactions = [] }: TaxEstimateDialogProps) {
  const [view, setView] = useState<'estimate' | 'law'>('estimate');

  // Reset to main view on open
  useEffect(() => {
    if (isOpen) setView('estimate');
  }, [isOpen]);

  if (!taxSummary || !taxSettings || !taxSummary.capitalTaxResult || !taxSummary.cryptoTaxResult || !taxSummary.futuresTaxResult) {
    return null;
  }

  const { capitalTaxResult: capital, cryptoTaxResult: crypto, futuresTaxResult: futuresTax } = taxSummary;
  const shortTermGainsTotal = taxSummary.totalShortTermGains;

  const capitalAllowanceRemaining = Math.max(0, (capital.allowance ?? 0) - (capital.allowanceUsed ?? 0));
  // Shared view for Futures section: explicitly subtract allowance used by Futures too
  const sharedAllowanceRemaining = Math.max(0, (capital.allowance ?? 0) - ((capital.allowanceUsed ?? 0) + (futuresTax.allowanceUsed ?? 0)));
  const cryptoThresholdRemaining = Math.max(0, (crypto.threshold ?? 0) - (shortTermGainsTotal ?? 0));

  // Prepare Futures transactions for audit export
  const investmentsForAudit = futuresTransactions.filter(t => new Date(t.date).getFullYear() === year);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-3xl p-0 gap-0">
        
        {/* VIEW 1: ESTIMATE BREAKDOWN */}
        {view === 'estimate' && (
          <>
            <DialogHeader className="px-6 pt-6 pb-2">
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5" /> Estimated Taxes for {year}
                </DialogTitle>
                {/* Added mr-8 to prevent overlap with the Dialog's absolute close button */}
                <Button size="sm" variant="outline" onClick={() => setView('law')} className="mr-8">
                  Law Info
                </Button>
              </div>
              <DialogDescription>
                This is an estimate for informational purposes only and not professional tax advice.
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 pb-6 max-h-[70vh] overflow-y-auto space-y-4">
               {/* Capital Gains Section */}
              <div className="p-4 rounded-md bg-muted/30 border">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                    Capital Income <span className="text-xs font-normal text-muted-foreground">(§20 EStG)</span>
                </h4>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Capital Income</span>
                    <span className="font-mono">{formatCurrency((capital.taxableBase ?? 0) + (capital.allowanceUsed ?? 0))}</span>
                    </div>

                    <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground pl-2 border-l-2 border-muted ml-1">
                      Shared Allowance Remaining ({formatCurrency(capital.allowance ?? 0)})
                    </span>
                    <span className="font-mono text-muted-foreground">{formatCurrency(sharedAllowanceRemaining)}</span>
                    </div>

                    <Separator className="my-1" />
                    <div className="flex justify-between font-medium">
                    <span>Taxable Base</span>
                    <span className="font-mono">{formatCurrency(capital.taxableBase)}</span>
                    </div>
                    
                    <div className="pl-2 border-l-2 border-primary/20 mt-2 space-y-1">
                        <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Base Tax ({formatPercent(TAX.abgeltungsteuer)})</span>
                        <span className="font-mono">{formatCurrency(capital.baseTax)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Solidarity Surcharge ({formatPercent(TAX.soliRate)})</span>
                        <span className="font-mono">{formatCurrency(capital.soli)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Church Tax ({taxSettings.churchTaxRate ? formatPercent(taxSettings.churchTaxRate) : '0%'})</span>
                        <span className="font-mono">{formatCurrency(capital.church)}</span>
                        </div>
                    </div>
                    <div className="flex justify-between font-bold mt-2 pt-2 border-t border-dashed">
                    <span>Total Capital Tax</span>
                    <span className="font-mono text-base">{formatCurrency(capital.total)}</span>
                    </div>
                </div>
              </div>

              {/* Crypto Section */}
              <div className="p-4 rounded-md bg-muted/30 border">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                    Crypto Private Sales <span className="text-xs font-normal text-muted-foreground">(§23 EStG)</span>
                </h4>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                    <span className="text-muted-foreground">Short-term Gains (≤1y)</span>
                    <span className="font-mono">{formatCurrency(shortTermGainsTotal)}</span>
                    </div>

                    <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground pl-2 border-l-2 border-muted ml-1">
                        Threshold Remaining ({formatCurrency(crypto.threshold)})
                    </span>
                    <span className="font-mono text-muted-foreground">{formatCurrency(cryptoThresholdRemaining)}</span>
                    </div>

                    <Separator className="my-1" />
                    <div className="flex justify-between font-medium">
                    <span>Taxable Base</span>
                    <span className="font-mono">{formatCurrency(crypto.taxableBase)}</span>
                    </div>
                    
                    <div className="pl-2 border-l-2 border-primary/20 mt-2 space-y-1">
                        <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Income Tax ({formatPercent(taxSettings.cryptoMarginalRate)})</span>
                        <span className="font-mono">{formatCurrency(crypto.incomeTax)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Solidarity Surcharge ({formatPercent(TAX.soliRate)})</span>
                        <span className="font-mono">{formatCurrency(crypto.soli)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Church Tax ({taxSettings.churchTaxRate ? formatPercent(taxSettings.churchTaxRate) : '0%'})</span>
                        <span className="font-mono">{formatCurrency(crypto.church)}</span>
                        </div>
                    </div>
                    <div className="flex justify-between font-bold mt-2 pt-2 border-t border-dashed">
                    <span>Total Crypto Tax</span>
                    <span className="font-mono text-base">{formatCurrency(crypto.total)}</span>
                    </div>
                </div>
              </div>

              {/* Futures & Derivatives Section */}
              <div className="p-4 rounded-md bg-muted/30 border">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  Futures & Derivatives <span className="text-xs font-normal text-muted-foreground">(§20 Abs. 6 EStG)</span>
                </h4>
                {futuresTax.totalGains === 0 && futuresTax.totalLosses === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No futures trading data available for this year.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-muted-foreground">Total Gains</p>
                        <p className="font-medium text-green-600">+{formatCurrency(futuresTax.totalGains)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Losses</p>
                        <p className="font-medium text-red-600">-{formatCurrency(futuresTax.totalLosses)}</p>
                      </div>
                    </div>

                    <Separator className="my-2" />
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deductible Losses (Max {formatCurrency(futuresTax.lossCap)})</span>
                      <span className="font-medium text-red-500">-{formatCurrency(futuresTax.deductibleLosses)}</span>
                    </div>

                    {/* Shared Sparer-Pauschbetrag usage */}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Allowance Used (shared with Capital Income)</span>
                      <span className="font-medium text-emerald-600">-{formatCurrency(futuresTax.allowanceUsed ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground pl-2 border-l-2 border-muted ml-1">Shared Allowance Remaining ({formatCurrency(capital.allowance ?? 0)})</span>
                      <span className="font-mono text-muted-foreground">{formatCurrency(sharedAllowanceRemaining)}</span>
                    </div>

                    {futuresTax.unusedLosses > 0 && (
                      <div className="flex justify-between text-xs text-amber-600 dark:text-amber-400">
                        <span>Unused Losses (Carry Forward)</span>
                        <span>{formatCurrency(futuresTax.unusedLosses)}</span>
                      </div>
                    )}

                    <div className="flex justify-between font-semibold mt-2 pt-2 border-t border-dashed">
                      <span>Taxable Base</span>
                      <span>{formatCurrency(futuresTax.taxableBase)}</span>
                    </div>

                    <div className="pl-2 border-l-2 border-primary/20 mt-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Base Tax ({formatPercent(TAX.abgeltungsteuer)})</span>
                        <span className="font-mono">{formatCurrency(futuresTax.baseTax)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Solidarity Surcharge ({formatPercent(TAX.soliRate)})</span>
                        <span className="font-mono">{formatCurrency(futuresTax.soli)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Church Tax ({taxSettings.churchTaxRate ? formatPercent(taxSettings.churchTaxRate) : '0%'})</span>
                        <span className="font-mono">{formatCurrency(futuresTax.church)}</span>
                      </div>
                    </div>
                    <div className="flex justify-between font-bold mt-2 pt-2 border-t border-dashed">
                      <span>Total Futures Tax</span>
                      <span className="font-mono text-base">{formatCurrency(futuresTax.total)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Note: The Sparer-Pauschbetrag is shared between Capital Income and Futures & Derivatives.</p>
                    
                    {/* Export Audit CSV Button */}
                    <div className="mt-4 pt-4 border-t">
                      <AuditExportButton 
                        transactions={investmentsForAudit} 
                          year={year}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Grand Total */}
              <div className="p-4 rounded-md bg-primary/10 border border-primary/20">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg text-primary">Grand Total Estimated Tax</span>
                  <span className="font-mono font-bold text-xl">{formatCurrency(taxSummary.grandTotal)}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* VIEW 2: LAW INFO */}
        {view === 'law' && (
          <>
             <DialogHeader className="px-6 pt-6 pb-2">
               <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setView('estimate')} className="-ml-2 h-8 w-8">
                      <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <DialogTitle>German Tax Basics for {year}</DialogTitle>
               </div>
            </DialogHeader>
            <div className="px-6 pb-6 max-h-[70vh] overflow-y-auto">
                <div className="text-sm space-y-6">
                  <div className="p-4 rounded-md bg-muted/30 border">
                    <h4 className="font-semibold text-base mb-2">Capital Income (§20 EStG)</h4>
                    <ul className="list-disc pl-5 text-muted-foreground space-y-2 leading-relaxed">
                      <li>
                        <strong>Annual allowance (“Sparer-Pauschbetrag”):</strong>{' '}
                        <span className="text-foreground">
                          €{defaultCapitalAllowance(year, taxSettings?.filingStatus ?? 'single').toLocaleString('de-DE')}
                        </span>
                      </li>
                      <li>
                        <strong>Shared with Futures & Derivatives:</strong> The annual <i>Sparer-Pauschbetrag</i> for Capital Income is <strong>shared</strong> with the Futures & Derivatives bucket. Any unused allowance here may be applied to reduce taxable futures gains.
                      </li>
                      <li>Applied to the <i>sum</i> of dividends, interest, and §20 capital gains.</li>
                      <li>Only the amount above the allowance is taxed.</li>
                      <li>
                        Taxed at the flat <strong>{Math.round(TAX.abgeltungsteuer * 100)}% Abgeltungsteuer</strong> rate (+ Soli/Church).
                      </li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-md bg-muted/30 border">
                    <h4 className="font-semibold text-base mb-2">Crypto Private Sales (§23 EStG)</h4>
                    <ul className="list-disc pl-5 text-muted-foreground space-y-2 leading-relaxed">
                      <li>
                        <strong>Short-term gains (holding ≤ 1 year)</strong> threshold for {year}:{' '}
                        <span className="text-foreground">
                          €{defaultCryptoThreshold(year).toLocaleString('de-DE')}
                        </span>
                      </li>
                      <li>If short-term gains ≤ threshold ➜ <strong>no tax</strong>.</li>
                      <li>If they exceed it, the <strong>full</strong> short-term gains amount becomes taxable.</li>
                      <li>Crypto held &gt; 1 year is <strong>tax-free</strong> (10 years if staking/lending).</li>
                      <li>Taxed at your <strong>marginal income tax rate</strong> ({Math.round((taxSettings?.cryptoMarginalRate ?? 0)*100)}%) + soli {Math.round(TAX.soliRate*100)}% (+ church tax if applicable).</li>
                    </ul>
                  </div>

                  <div className="p-4 rounded-md bg-muted/30 border">
                    <h4 className="font-semibold text-base mb-2">Futures & Derivatives (§20 Abs. 6 EStG)</h4>
                    <ul className="list-disc pl-5 text-muted-foreground space-y-2 leading-relaxed">
                      <li>
                        <strong>Loss Offset Limit (€20,000):</strong>{' '}
                        Unlike stocks/crypto, losses from term transactions (futures, options, CFDs) can only be offset against gains from the <i>same category</i>, capped at <span className="text-foreground">€20,000 per year</span>.
                      </li>
                      <li>
                        <strong>Carry Forward:</strong> Losses exceeding the €20k cap are <strong>not lost</strong>; they are carried forward to offset future gains in subsequent years.
                      </li>
                      <li>
                        <strong>Shared Allowance:</strong> The annual <i>Sparer-Pauschbetrag</i> for Capital Income is <strong>shared</strong> with Futures & Derivatives. Any unused allowance from Capital Income may reduce taxable futures gains.
                      </li>
                      <li>
                        <strong>The "Tax Trap":</strong> Be careful. You can owe taxes on gross gains even if your net PnL is negative (if gross losses exceed €20k).
                      </li>
                      <li>
                        Taxed at the flat <strong>25% Abgeltungsteuer</strong> rate (+ Soli/Church).
                      </li>
                    </ul>
                  </div>
                </div>
            </div>
            <div className="p-4 border-t bg-background flex justify-end">
                <Button onClick={() => setView('estimate')}>Back to Estimate</Button>
            </div>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}


const getSummaryContext = (filter: YearFilter): { title: string; description: string } => {
  if (filter.kind === 'all') {
    switch (filter.mode) {
      case 'holdings':
        return {
          title: 'Portfolio Summary – Lifetime (Holdings Snapshot)',
          description:
            'Shows only open positions as of today and their current unrealized gains. Realized gains excluded.',
        };
      case 'realized':
        return {
          title: 'Portfolio Summary – Lifetime (Realized-Only)',
          description:
            'Shows lifetime realized gains from sold positions. Unrealized gains excluded. Useful for tax history.',
        };
      case 'combined':
      default:
        return {
          title: 'Portfolio Summary – Lifetime (Combined)',
          description:
            'Includes all realized gains since inception + current unrealized gains on holdings.',
        };
    }
  }

  const year = filter.year;
  switch (filter.mode) {
    case 'combined':
      return {
        title: `Portfolio Summary – Year ${year} (Combined)`,
        description:
          'Shows this year’s realized gains + current unrealized gains on holdings. Not a pure tax view.',
      };
    case 'realized':
      return {
        title: `Portfolio Summary – Year ${year} (Tax-Only)`,
        description:
          'Shows only assets sold in this year. Unrealized gains excluded. Used for tax estimates.',
      };
    case 'holdings':
    default:
      return {
        title: `Portfolio Summary – Year ${year} (Holdings Snapshot)`,
        description:
          'Shows only open positions and their current unrealized gains.',
      };
  }
};


export type PortfolioSummaryHandle = { openEstimate: () => void };

interface PortfolioSummaryProps {
    summaryData: AggregatedSummary | null;
    sellYears: number[];
    isTaxView: boolean;
    taxSettings: TaxSettings | null;
    yearFilter: YearFilter;
    onYearFilterChange: (filter: YearFilter) => void;
}

function PortfolioSummaryImpl({ 
    summaryData, 
    sellYears, 
    isTaxView, 
    taxSettings,
    yearFilter,
    onYearFilterChange,
}: PortfolioSummaryProps, ref: React.Ref<PortfolioSummaryHandle>) {
    
    const [donutMode, setDonutMode] = useState<DonutMode>('market');
    const [isEstimateOpen, setIsEstimateOpen] = useState(false);
    const [isInfoOpen, setIsInfoOpen] = useState(false);

    useEffect(() => {
      if (yearFilter.mode === 'holdings') setDonutMode('market');
      else setDonutMode('economic');
    }, [yearFilter.mode]);

    const openEstimate = useCallback(() => setIsEstimateOpen(true), []);
    useImperativeHandle(ref, () => ({ openEstimate }), [openEstimate]);

    useEffect(() => {
      if (!summaryData?.taxSummary) {
        setIsEstimateOpen(false);
      }
    }, [summaryData?.taxSummary]);

    useEffect(() => {
      if (yearFilter.kind !== 'year' || !isTaxView) {
        setIsEstimateOpen(false);
      }
    }, [yearFilter.kind, isTaxView]);
    
    const handleYearChange = (value: string) => {
        const currentMode = yearFilter.mode ?? 'combined';
        if (value === 'all') {
            onYearFilterChange({ kind: 'all', mode: currentMode });
        } else {
            onYearFilterChange({ kind: 'year', year: parseInt(value), mode: currentMode });
        }
    };

    const handleModeChange = (mode: ViewMode) => {
        if (yearFilter.kind === 'year') {
            onYearFilterChange({ ...yearFilter, mode });
        } else {
            onYearFilterChange({ kind: 'all', mode });
        }
    };

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
            .filter(row => row.value > 0); // Ensure 'Future' is included if it has value
    }, [summaryData, donutMode]);

    if (!summaryData) {
        return null;
    }

    const { rows, totals, taxSummary } = summaryData;
    const totalPortfolioValue = donutMode === 'market' ? totals.marketValue : totals.economicValue;
    const showTaxEstimatorButton = isTaxView && taxSummary && yearFilter.kind === 'year';

    const { title, description } = getSummaryContext(yearFilter);
    const isYearView = yearFilter.kind === 'year';
    const isAllView = yearFilter.kind === 'all';

    const mode = yearFilter.mode ?? 'holdings';
    const showRealizedCol = mode !== 'holdings';
    const showUnrealizedCol = mode !== 'realized';
    const marketValueLabel = mode === 'realized' ? 'Realized Proceeds' : 'Market Value';

    const pctLabel =
        yearFilter.mode === 'realized'
            ? '(Realized)'
            : donutMode === 'market' ? '(Market)' : '(Economic)';

    return (
        <TooltipProvider>
        <Card>
            <CardHeader>
               <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                           <CardTitle className="font-headline text-2xl">{title}</CardTitle>
                            <Button variant="ghost" size="icon" onClick={() => setIsInfoOpen(true)}>
                                <Info className="h-5 w-5" />
                                <span className="sr-only">Show Explanations</span>
                            </Button>
                        </div>
                        <CardDescription>{description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                         <Select
                          value={yearFilter.kind === 'year' ? String(yearFilter.year) : 'all'}
                          onValueChange={(val) => {
                            if (val === 'all') {
                              onYearFilterChange({ kind: 'all', mode: yearFilter.mode });
                            } else {
                              const yr = Number(val);
                              onYearFilterChange({ kind: 'year', year: yr, mode: yearFilter.mode });
                            }
                          }}
                        >
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
                    </div>
                </div>
                 {(isYearView || isAllView) && (
                    <div className="mt-4">
                        <Tabs value={yearFilter.mode ?? 'combined'} onValueChange={(v) => handleModeChange(v as ViewMode)}>
                            <TabsList>
                                <TabsTrigger value="holdings">Holdings</TabsTrigger>
                                <TabsTrigger value="realized">Realized (Tax)</TabsTrigger>
                                <TabsTrigger value="combined">Combined</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                )}
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Asset Type</TableHead>
                                    <TableHead className="text-right">
                                        {mode === 'realized'
                                            ? (
                                            <Tooltip>
                                                <TooltipTrigger className="cursor-help underline decoration-dashed">
                                                Cost Basis (sold)
                                                </TooltipTrigger>
                                                <TooltipContent>Cost basis of the lots sold in this {yearFilter.kind === 'all' ? 'lifetime period' : `year (${yearFilter.year})`}.</TooltipContent>
                                            </Tooltip>
                                            )
                                            : 'Cost Basis'}
                                    </TableHead>
                                    <TableHead className="text-right">
                                        {mode === 'realized' ? (
                                            <Tooltip>
                                            <TooltipTrigger className="cursor-help underline decoration-dashed">
                                                {marketValueLabel}
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                Cash proceeds from sold lots
                                                {yearFilter.kind === 'year' ? ` in ${yearFilter.year}` : ' (lifetime)'}.
                                            </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            marketValueLabel
                                        )}
                                    </TableHead>
                                    
                                    {showRealizedCol && (
                                        <TableHead className="text-right">
                                            {isYearView ? (
                                                <Tooltip>
                                                    <TooltipTrigger className="cursor-help underline decoration-dashed">Realized P/L</TooltipTrigger>
                                                    <TooltipContent>Only includes sales completed in {yearFilter.year}.</TooltipContent>
                                                </Tooltip>
                                            ) : 'Realized P/L'}
                                        </TableHead>
                                    )}

                                    {showUnrealizedCol && (
                                        <TableHead className="text-right">
                                            {isYearView ? (
                                                <Tooltip>
                                                    <TooltipTrigger className="cursor-help underline decoration-dashed">Unrealized P/L</TooltipTrigger>
                                                    <TooltipContent>Based on current prices, not prices from {yearFilter.year}.</TooltipContent>
                                                </Tooltip>
                                            ) : 'Unrealized P/L'}
                                        </TableHead>
                                    )}

                                    <TableHead className="text-right">Total P/L</TableHead>
                                    <TableHead className="text-right">Performance</TableHead>
                                    <TableHead className="text-right">% of Portfolio {pctLabel}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rows.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={showRealizedCol && showUnrealizedCol ? 8 : 7} className="text-center text-muted-foreground py-8">
                                    {yearFilter.kind === 'year'
                                      ? `No assets were sold in ${yearFilter.year}.`
                                      : 'No assets match this view.'}
                                  </TableCell>
                                </TableRow>
                              ) : (
                                rows.map(item => {
                                    const portfolioPercentage = totalPortfolioValue > 0 
                                      ? ((donutMode === 'market' ? item.marketValue : item.economicValue) / totalPortfolioValue)
                                      : 0;

                                    return (
                                    <TableRow key={item.type}>
                                        <TableCell className="font-medium">{item.type}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(item.costBasis)}</TableCell>
                                        <TableCell className="text-right font-mono font-bold">{formatCurrency(item.marketValue)}</TableCell>
                                        
                                        {showRealizedCol && (
                                            <TableCell className={cn("text-right font-mono", item.realizedPL >= 0 ? "text-green-500" : "text-destructive")}>
                                                {formatCurrency(item.realizedPL)}
                                            </TableCell>
                                        )}
                                        
                                        {showUnrealizedCol && (
                                            <TableCell className={cn("text-right font-mono", item.unrealizedPL >= 0 ? "text-green-500" : "text-destructive")}>
                                                {formatCurrency(item.unrealizedPL)}
                                            </TableCell>
                                        )}

                                        <TableCell className={cn("text-right font-mono flex items-center justify-end gap-1", item.totalPL >= 0 ? "text-green-500" : "text-destructive")}>
                                          {item.totalPL >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                          {formatCurrency(item.totalPL)}
                                        </TableCell>
                                        <TableCell className={cn("text-right font-mono", item.performancePct >= 0 ? "text-green-500" : "text-destructive")}>{formatPercent(item.performancePct)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatPercent(portfolioPercentage)}</TableCell>
                                    </TableRow>
                                )})
                              )}
                            </TableBody>
                            <TableFooter>
                                <TableRow className="bg-muted/50 font-bold">
                                    <TableCell>Total</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(totals.costBasis)}</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(totals.marketValue)}</TableCell>
                                    
                                    {showRealizedCol && (
                                        <TableCell className={cn("text-right font-mono", totals.realizedPL >= 0 ? "text-green-500" : "text-destructive")}>
                                            {formatCurrency(totals.realizedPL)}
                                        </TableCell>
                                    )}

                                    {showUnrealizedCol && (
                                        <TableCell className={cn("text-right font-mono", totals.unrealizedPL >= 0 ? "text-green-500" : "text-destructive")}>
                                            {formatCurrency(totals.unrealizedPL)}
                                        </TableCell>
                                    )}

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
                                <RechartsTooltip
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
                                    cx="50%" cy="50%" outerRadius={80} innerRadius={50}
                                    paddingAngle={2} labelLine={false}
                                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                                        const RADIAN = Math.PI / 180;
                                        const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
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
        <Dialog open={isInfoOpen} onOpenChange={setIsInfoOpen}>
            <DialogContent className="w-[96vw] max-w-3xl p-0">
                <DialogHeader className="px-6 pt-6 pb-2">
                    <DialogTitle>Summary Column Explanations</DialogTitle>
                    <DialogDescription>How each value in the summary table is calculated.</DialogDescription>
                </DialogHeader>
                <div className="px-6 pb-6 max-h-[65vh] overflow-y-auto space-y-4">
                    <div>
                        <h4 className="font-semibold">Filter Explanation</h4>
                        <ul className="list-disc pl-5 mt-2 space-y-2 text-muted-foreground">
                            <li><span className="font-semibold text-foreground">All Years View:</span> Shows a lifetime summary of all investments (active and sold).</li>
                            <li><span className="font-semibold text-foreground">Specific Year View:</span> Restricts calculations to a single year and enables different view modes.</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold">Yearly View Modes</h4>
                        <p className="text-muted-foreground">When a specific year is selected, these modes change which investments are included in the summary.</p>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
                            <li><span className="font-semibold text-foreground">Holdings:</span> Shows ONLY currently open positions. Realized P/L is hidden.</li>
                            <li><span className="font-semibold text-foreground">Realized (Tax):</span> Shows ONLY positions that had a sale in the selected year. Unrealized P/L is hidden. Market Value represents Realized Proceeds.</li>
                            <li><span className="font-semibold text-foreground">Combined:</span> (Default) Shows all currently open positions PLUS any positions that had a sale in the selected year.</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold">Cost Basis</h4>
                        <p className="text-muted-foreground">The original purchase price of the assets included in the current view. <br/><code className="text-xs">Formula: For each included investment, sum of (Original Purchase Price per Unit x Quantity)</code></p>
                    </div>
                    <div>
                        <h4 className="font-semibold">{marketValueLabel}</h4>
                        <p className="text-muted-foreground">In Holdings/Combined mode, this is the current value of assets you still own. In Realized mode, it shows the cash proceeds from sales.<br/><code className="text-xs">Formula (Holdings/Combined): Available Quantity × Current Price per Unit</code><br/><code className="text-xs">Formula (Realized): Sum of (Sell Price x Quantity Sold)</code></p>
                    </div>
                    {showRealizedCol && (
                        <div>
                            <h4 className="font-semibold">Realized P/L (Profit/Loss)</h4>
                            <p className="text-muted-foreground">Your &quot;locked-in&quot; profit or loss from sales, filtered by the selected period.<br/><code className="text-xs">Formula: Sum of (Sell Price - Original Purchase Price) × Quantity Sold</code></p>
                        </div>
                    )}
                    {showUnrealizedCol && (
                        <div>
                            <h4 className="font-semibold">Unrealized P/L (Profit/Loss)</h4>
                            <p className="text-muted-foreground">Your &quot;paper&quot; profit or loss on assets you still hold.<br/><code className="text-xs">Formula: Market Value - Cost Basis of remaining shares</code></p>
                        </div>
                    )}
                    <div>
                        <h4 className="font-semibold">Total P/L (Profit/Loss)</h4>
                        <p className="text-muted-foreground">The complete picture of your profit or loss, combining the (filtered) realized gains/losses with the current unrealized gains/losses.<br/><code className="text-xs">Formula: Realized P/L + Unrealized P/L</code></p>
                    </div>
                    <div>
                        <h4 className="font-semibold">Performance</h4>
                        <p className="text-muted-foreground">The total percentage return for the assets included in the current view.</p>
                        <p className="text-muted-foreground mt-1"><code className="text-xs">Formula: (Total P/L / Total Original Purchase Value) × 100</code></p>
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
                        <p className="text-muted-foreground">The &quot;Total&quot; row sums the numeric columns from the rows above it. The &quot;Performance&quot; percentage is then re-calculated based on the grand totals to provide a true weighted-average performance for your entire portfolio.</p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        {yearFilter.kind === 'year' && (
          <TaxEstimateDialog 
            isOpen={isEstimateOpen}
            onOpenChange={setIsEstimateOpen}
            taxSummary={taxSummary}
            year={yearFilter.year}
            taxSettings={taxSettings}
            futuresTransactions={summaryData?.futuresTransactions}
          />
        )}
        </TooltipProvider>
    );
}

export default forwardRef(PortfolioSummaryImpl);
