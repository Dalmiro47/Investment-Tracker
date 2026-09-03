"use client";

import { useState, useMemo, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import type { Investment, Transaction, YearFilter, TaxSettings, AggregatedSummary, ViewMode, FuturePosition } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useClosedPositionsForYear } from '@/hooks/useClosedPositionsForYear';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Info,
  Scale,
  ArrowLeft,
  LineChart,
  Briefcase,
  Bitcoin,
  Landmark,
  FileText,
  Building2,
  CandlestickChart,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent, toNum } from '@/lib/money';
import { YearTaxSummary } from '@/lib/portfolio';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from './ui/dialog';
import { TAX, defaultCapitalAllowance, defaultCryptoThreshold } from '@/lib/tax';
import { Separator } from './ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { AuditExportButton } from './tax/AuditExportButton';


const CHART_COLORS = [
    'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
    'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-6))',
    'hsl(var(--chart-7))'
];

type DonutMode = 'market' | 'economic';

const TYPE_ICONS: Record<string, LucideIcon> = {
    Stock: LineChart,
    ETF: Briefcase,
    Crypto: Bitcoin,
    'Interest Account': Landmark,
    Bond: FileText,
    'Real Estate': Building2,
    Future: CandlestickChart,
};

const TYPE_SHORT: Record<string, string> = {
    'Interest Account': 'Interest',
    Future: 'Futures',
};

const shortType = (type: string) => TYPE_SHORT[type] ?? type;

/** Splits a formatted de-DE currency string into the major part and the cents tail. */
const splitCurrency = (value: number): { major: string; cents: string } => {
    const formatted = formatCurrency(value);
    const idx = formatted.lastIndexOf(',');
    if (idx === -1) return { major: formatted, cents: '' };
    return { major: formatted.slice(0, idx), cents: formatted.slice(idx) };
};

// de-DE compact notation only abbreviates from millions, so below that show whole euros.
const compactCurrency = (value: number) =>
    new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        ...(Math.abs(value) >= 1_000_000
            ? { notation: 'compact' as const, maximumFractionDigits: 1 }
            : { maximumFractionDigits: 0 }),
    }).format(value);

function DeltaChip({ positive, children }: { positive: boolean; children: React.ReactNode }) {
    return (
        <span
            className={cn(
                'inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[12px] font-bold',
                positive
                    ? 'border-success/30 bg-success/[.12] text-success'
                    : 'border-destructive/30 bg-destructive/[.12] text-destructive',
            )}
        >
            {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            <span className="font-mono">{children}</span>
        </span>
    );
}

interface TaxEstimateDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    taxSummary: YearTaxSummary | null;
    year: number;
    taxSettings: TaxSettings | null;
    futuresTransactions?: Transaction[];
    userId: string | null | undefined;
}

function TaxEstimateDialog({ isOpen, onOpenChange, taxSummary, year, taxSettings, futuresTransactions = [], userId }: TaxEstimateDialogProps) {
  const [view, setView] = useState<'estimate' | 'law'>('estimate');
  
  // Fetch closed positions for the year
  const { positions: closedPositions } = useClosedPositionsForYear(userId, year);

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

            <div className="px-6 pb-6 etf-dialog-scroll max-h-[70vh] overflow-y-auto space-y-4">
               {/* Capital Gains Section */}
              <div className="rounded-[10px] border border-border bg-black/[.28] p-4">
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
              <div className="rounded-[10px] border border-border bg-black/[.28] p-4">
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
              <div className="rounded-[10px] border border-border bg-black/[.28] p-4">
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
                        <p className="font-bold gain">+{formatCurrency(futuresTax.totalGains)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Losses</p>
                        <p className="font-bold loss">-{formatCurrency(futuresTax.totalLosses)}</p>
                      </div>
                    </div>

                    <Separator className="my-2" />
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deductible Losses (Max {formatCurrency(futuresTax.lossCap)})</span>
                      <span className="font-bold loss">-{formatCurrency(futuresTax.deductibleLosses)}</span>
                    </div>

                    {/* Shared Sparer-Pauschbetrag usage */}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Allowance Used (shared with Capital Income)</span>
                      <span className="font-bold gain">-{formatCurrency(futuresTax.allowanceUsed ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground pl-2 border-l-2 border-muted ml-1">Shared Allowance Remaining ({formatCurrency(capital.allowance ?? 0)})</span>
                      <span className="font-mono text-muted-foreground">{formatCurrency(sharedAllowanceRemaining)}</span>
                    </div>

                    {futuresTax.unusedLosses > 0 && (
                      <div className="flex justify-between text-xs text-warning">
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
                        positions={closedPositions}
                        year={year}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Grand Total */}
              <div className="p-4 rounded-md border border-primary/25 bg-primary/[.1]">
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
            <div className="px-6 pb-6 etf-dialog-scroll max-h-[70vh] overflow-y-auto">
                <div className="text-sm space-y-6">
                  <div className="rounded-[10px] border border-border bg-black/[.28] p-4">
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

                  <div className="rounded-[10px] border border-border bg-black/[.28] p-4">
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

                  <div className="rounded-[10px] border border-border bg-black/[.28] p-4">
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
                        <strong>The &quot;Tax Trap&quot;:</strong> Be careful. You can owe taxes on gross gains even if your net PnL is negative (if gross losses exceed €20k).
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
    userId: string | null | undefined;
}

function PortfolioSummaryImpl({
    summaryData,
    isTaxView,
    taxSettings,
    yearFilter,
    onYearFilterChange,
    userId,
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

    // Adjust totals to exclude Future from Cost Basis and Market Value (since they're N/A)
    const futureRow = rows.find(r => r.type === 'Future');
    const adjustedTotals = futureRow
        ? {
            ...totals,
            costBasis: totals.costBasis - futureRow.costBasis,
            marketValue: totals.marketValue - futureRow.marketValue,
        }
        : totals;

    const totalPortfolioValue = donutMode === 'market' ? totals.marketValue : totals.economicValue;
    const showTaxEstimatorButton = Boolean(isTaxView && taxSummary && yearFilter.kind === 'year');

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

    const donutLabel = donutMode === 'market' ? 'Market' : 'Economic';
    const periodLabel = isYearView ? String(yearFilter.year) : 'All years';
    const modeLabel = mode === 'holdings' ? 'Holdings' : mode === 'realized' ? 'Realized' : 'Combined';
    const heroAmount = splitCurrency(totalPortfolioValue);
    const colorForType = (type: string) =>
        CHART_COLORS[Math.max(0, rows.findIndex(r => r.type === type)) % CHART_COLORS.length];
    const typeTiles = [...rows].sort((a, b) => b.marketValue - a.marketValue).slice(0, 4);
    const clampPct = (value: number) => Math.max(0, Math.min(100, value * 100));

    return (
        <TooltipProvider>
        <div className="flex flex-col gap-4 lg:gap-5">
            {/* ── HERO ───────────────────────────────────────────────── */}
            <section className="animate-enter grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_1fr] lg:items-stretch lg:gap-5">
                <div className="glass-strong flex flex-col justify-between gap-4 overflow-hidden p-5 sm:p-[26px] sm:px-7">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -right-16 -top-20 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/.16),transparent_62%)]"
                    />
                    <div className="relative flex items-start justify-between gap-3">
                        <span className="eyebrow" title={title}>
                            Portfolio value · {modeLabel} · {donutLabel} · {periodLabel}
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsInfoOpen(true)}
                            className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <Info className="h-4 w-4" />
                            <span className="hidden sm:inline">Explanations</span>
                            <span className="sr-only">Show Explanations</span>
                        </button>
                    </div>

                    <h2 className="sr-only">{title}</h2>

                    <div className="relative flex flex-wrap items-end gap-4">
                        <div className="font-headline font-mono text-[40px] font-bold leading-none tracking-[-.035em] sm:text-[52px] lg:text-[64px]">
                            {heroAmount.major}
                            <span className="text-[20px] text-muted-foreground sm:text-[26px] lg:text-[30px]">
                                {heroAmount.cents}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pb-1.5">
                            <DeltaChip positive={totals.performancePct >= 0}>
                                {formatPercent(totals.performancePct)}
                            </DeltaChip>
                            {showUnrealizedCol && (
                                <DeltaChip positive={totals.unrealizedPL >= 0}>
                                    {formatCurrency(totals.unrealizedPL)} unrealized
                                </DeltaChip>
                            )}
                            {showRealizedCol && (
                                <DeltaChip positive={totals.realizedPL >= 0}>
                                    {formatCurrency(totals.realizedPL)} realized
                                </DeltaChip>
                            )}
                        </div>
                    </div>

                    <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                            <span>
                                Cost basis{' '}
                                <span className="font-mono text-foreground">{formatCurrency(adjustedTotals.costBasis)}</span>
                            </span>
                            <span>
                                Realized {periodLabel}{' '}
                                <span className={cn('font-mono', totals.realizedPL >= 0 ? 'gain' : 'loss')}>
                                    {formatCurrency(totals.realizedPL)}
                                </span>
                            </span>
                            <span>
                                Positions <span className="font-mono text-foreground">{rows.length}</span>
                            </span>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                            {showTaxEstimatorButton && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="justify-center text-warning hover:text-warning"
                                    onClick={openEstimate}
                                >
                                    <Scale className="h-4 w-4" />
                                    View tax estimate
                                </Button>
                            )}
                            {(isYearView || isAllView) && (
                                <Tabs
                                    value={yearFilter.mode ?? 'combined'}
                                    onValueChange={(v) => handleModeChange(v as ViewMode)}
                                    className="w-full sm:w-auto"
                                >
                                    <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
                                        <TabsTrigger value="holdings">Holdings</TabsTrigger>
                                        <TabsTrigger value="realized">Realized</TabsTrigger>
                                        <TabsTrigger value="combined">Combined</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Asset-type tiles ── */}
                <div className="grid grid-cols-2 gap-2.5 lg:gap-3">
                    {typeTiles.map((tile, index) => {
                        const TileIcon = TYPE_ICONS[tile.type] ?? Briefcase;
                        const tileValue = donutMode === 'market' ? tile.marketValue : tile.economicValue;
                        const share = totalPortfolioValue > 0 ? tileValue / totalPortfolioValue : 0;
                        const color = colorForType(tile.type);
                        const isFutureTile = tile.type === 'Future';
                        // Odd tile count: the largest holding takes the full first row
                        // so the grid never leaves a blank cell.
                        const spansRow = index === 0 && typeTiles.length % 2 === 1;
                        return (
                            <div
                                key={tile.type}
                                className={cn(
                                    'glass flex flex-col justify-between gap-2.5 p-3.5 lg:p-4',
                                    spansRow && 'col-span-2',
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-2 text-[12px] font-bold text-muted-foreground lg:text-[13px]">
                                        <span style={{ color }} className="inline-flex shrink-0">
                                            <TileIcon size={20} />
                                        </span>
                                        <span className="truncate">{shortType(tile.type)}</span>
                                    </span>
                                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                                        {isFutureTile ? '—' : formatPercent(share)}
                                    </span>
                                </div>
                                <div className="font-headline font-mono text-[20px] font-bold tracking-[-.02em] lg:text-[24px]">
                                    {isFutureTile ? '—' : formatCurrency(tileValue)}
                                </div>
                                <div className="flex items-center justify-between gap-2.5">
                                    <div className="bar flex-1" style={{ color }}>
                                        <i style={{ width: `${clampPct(share)}%` }} />
                                    </div>
                                    <span
                                        className={cn(
                                            'shrink-0 font-mono text-[11px] font-bold lg:text-[12px]',
                                            tile.totalPL >= 0 ? 'gain' : 'loss',
                                        )}
                                    >
                                        {isFutureTile ? formatCurrency(tile.totalPL) : formatPercent(tile.performancePct)}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* ── ALLOCATION ─────────────────────────────────────────── */}
            <Card className="animate-enter delay-2 p-4 sm:p-5 lg:px-[22px]">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 p-0 pb-4">
                <div className="min-w-0">
                    <CardTitle className="text-[16px] lg:text-[18px]">Allocation by asset type</CardTitle>
                    <CardDescription className="mt-1">{description}</CardDescription>
                </div>
                <Tabs value={donutMode} onValueChange={(v) => setDonutMode(v as DonutMode)}>
                    <TabsList>
                        <TabsTrigger value="market">Market</TabsTrigger>
                        <TabsTrigger value="economic">Economic</TabsTrigger>
                    </TabsList>
                </Tabs>
            </CardHeader>
            <CardContent className="p-0">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px] lg:items-center lg:gap-7">
                    <div className="order-2 min-w-0 lg:order-1">
                        {/* Mobile: per-type list */}
                        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border md:hidden">
                            {rows.length === 0 ? (
                                <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                                    {yearFilter.kind === 'year'
                                        ? `No assets were sold in ${yearFilter.year}.`
                                        : 'No assets match this view.'}
                                </div>
                            ) : (
                                <>
                                    {rows.map(item => {
                                        const isFuture = item.type === 'Future';
                                        const value = donutMode === 'market' ? item.marketValue : item.economicValue;
                                        return (
                                            <div key={item.type} className="flex items-center justify-between gap-3 px-4 py-3">
                                                <div className="min-w-0">
                                                    <div className="truncate text-[14px] font-bold">{shortType(item.type)}</div>
                                                    <div className="font-mono text-[12px] text-muted-foreground">
                                                        {isFuture ? '—' : formatCurrency(value)}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div className={cn('font-mono text-[14px] font-bold', item.totalPL >= 0 ? 'gain' : 'loss')}>
                                                        {formatCurrency(item.totalPL)}
                                                    </div>
                                                    <div className="font-mono text-[11px] text-muted-foreground">
                                                        {isFuture ? 'P/L only' : formatPercent(item.performancePct)}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div className="flex items-center justify-between gap-3 border-t border-input bg-white/[.02] px-4 py-3">
                                        <span className="text-[14px] font-extrabold">Total</span>
                                        <span className={cn('font-mono text-[14px] font-extrabold', totals.totalPL >= 0 ? 'gain' : 'loss')}>
                                            {formatCurrency(totals.totalPL)}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* md+: full table */}
                        <div className="hidden overflow-x-auto md:block">
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

                                    const isFuture = item.type === 'Future';

                                    return (
                                    <TableRow key={item.type}>
                                        <TableCell className="font-medium">{item.type}</TableCell>
                                        <TableCell className="text-right font-mono">
                                          {isFuture ? (
                                            <Tooltip>
                                              <TooltipTrigger className="cursor-help text-muted-foreground">
                                                —
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                Not applicable for derivatives. P&L is the primary metric.
                                              </TooltipContent>
                                            </Tooltip>
                                          ) : (
                                            formatCurrency(item.costBasis)
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-bold">
                                          {isFuture ? (
                                            <Tooltip>
                                              <TooltipTrigger className="cursor-help text-muted-foreground">
                                                —
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                Not applicable for derivatives. P&L is the primary metric.
                                              </TooltipContent>
                                            </Tooltip>
                                          ) : (
                                            formatCurrency(item.marketValue)
                                          )}
                                        </TableCell>
                                        
                                        {showRealizedCol && (
                                            <TableCell className={cn("text-right", item.realizedPL >= 0 ? "gain" : "loss")}>
                                                {formatCurrency(item.realizedPL)}
                                            </TableCell>
                                        )}

                                        {showUnrealizedCol && (
                                            <TableCell className={cn("text-right", item.unrealizedPL >= 0 ? "gain" : "loss")}>
                                                {formatCurrency(item.unrealizedPL)}
                                            </TableCell>
                                        )}

                                        <TableCell className={cn("text-right", item.totalPL >= 0 ? "gain" : "loss")}>
                                          <span className="inline-flex items-center justify-end gap-1">
                                          {item.totalPL >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                          {formatCurrency(item.totalPL)}
                                          </span>
                                        </TableCell>
                                        <TableCell className={cn("text-right", item.performancePct >= 0 ? "gain" : "loss")}>
                                          {isFuture ? (
                                            <Tooltip>
                                              <TooltipTrigger className="cursor-help text-muted-foreground">
                                                —
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                Performance % not applicable for derivatives trading.
                                              </TooltipContent>
                                            </Tooltip>
                                          ) : (
                                            formatPercent(item.performancePct)
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <div className="flex items-center justify-end gap-2">
                                            <div className="bar w-14 shrink-0" style={{ color: colorForType(item.type) }}>
                                              <i style={{ width: `${clampPct(portfolioPercentage)}%` }} />
                                            </div>
                                            <span className="min-w-[44px] text-right">{formatPercent(portfolioPercentage)}</span>
                                          </div>
                                        </TableCell>
                                    </TableRow>
                                )})
                              )}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell>Total</TableCell>
                                    <TableCell className="text-right">
                                      <Tooltip>
                                        <TooltipTrigger className="cursor-help">
                                          {formatCurrency(adjustedTotals.costBasis)}
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          Excludes derivatives (Futures) as they don&apos;t have traditional cost basis
                                        </TooltipContent>
                                      </Tooltip>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Tooltip>
                                        <TooltipTrigger className="cursor-help">
                                          {formatCurrency(adjustedTotals.marketValue)}
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          Excludes derivatives (Futures) as they don&apos;t have traditional market value
                                        </TooltipContent>
                                      </Tooltip>
                                    </TableCell>

                                    {showRealizedCol && (
                                        <TableCell className={cn("text-right", totals.realizedPL >= 0 ? "gain" : "loss")}>
                                            {formatCurrency(totals.realizedPL)}
                                        </TableCell>
                                    )}

                                    {showUnrealizedCol && (
                                        <TableCell className={cn("text-right", totals.unrealizedPL >= 0 ? "gain" : "loss")}>
                                            {formatCurrency(totals.unrealizedPL)}
                                        </TableCell>
                                    )}

                                    <TableCell className={cn("text-right", totals.totalPL >= 0 ? "gain" : "loss")}>
                                        <span className="inline-flex items-center justify-end gap-1">
                                        {totals.totalPL >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                        {formatCurrency(totals.totalPL)}
                                        </span>
                                    </TableCell>
                                    <TableCell className={cn("text-right", totals.performancePct >= 0 ? "gain" : "loss")}>{formatPercent(totals.performancePct)}</TableCell>
                                    <TableCell className="text-right">{formatPercent(1)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                        </div>
                    </div>

                    {/* ── Donut ── */}
                    <div className="order-1 flex flex-col items-center gap-4 lg:order-2">
                        <div className="relative w-full max-w-[260px]">
                            <ChartContainer config={{}} className="aspect-square h-auto w-full">
                                {chartData.length > 0 ? (
                                <PieChart>
                                    <RechartsTooltip
                                        cursor={false}
                                        content={<ChartTooltipContent
                                            hideLabel
                                            formatter={(value, name, props) => (
                                                <div className="flex flex-col">
                                                    <span className="font-bold">{props.payload.name}</span>
                                                    <span className="font-mono">{formatCurrency(props.payload.value as number)}</span>
                                                    <span className="text-muted-foreground">{formatPercent((props.payload.payload as any).percentage / 100)} of portfolio</span>
                                                </div>
                                            )}
                                        />}
                                    />
                                    <Pie
                                        data={chartData} dataKey="value" nameKey="name"
                                        cx="50%" cy="50%" outerRadius="90%" innerRadius="60%"
                                        paddingAngle={3} labelLine={false} label={false}
                                        stroke="hsl(var(--card))"
                                    >
                                        {chartData.map((entry, index) => ( <Cell key={`cell-${index}`} fill={entry.fill} /> ))}
                                    </Pie>
                                </PieChart>
                                ) : (
                                    <div className="flex h-full flex-col items-center justify-center text-center">
                                        <Info className="mb-2 h-8 w-8 text-muted-foreground"/>
                                        <p className="text-sm text-muted-foreground">No data to display in chart.</p>
                                    </div>
                                )}
                            </ChartContainer>
                            {chartData.length > 0 && (
                                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                                    <span className="eyebrow text-[9px]">{donutLabel}</span>
                                    <span className="font-headline font-mono text-[18px] font-bold lg:text-[22px]">
                                        {compactCurrency(totalPortfolioValue)}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
                            {chartData.map((entry, index) => (
                                <span key={`legend-${index}`} className="flex items-center gap-[7px] text-[12px] text-muted-foreground">
                                    <span
                                        className="h-2 w-2 rounded-[3px]"
                                        style={{ backgroundColor: entry.fill, boxShadow: `0 0 8px ${entry.fill}` }}
                                    />
                                    {shortType(entry.name)}{' '}
                                    <span className="font-mono text-muted-foreground/70">
                                        {formatPercent(entry.percentage / 100)}
                                    </span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
        </div>
        <Dialog open={isInfoOpen} onOpenChange={setIsInfoOpen}>
            <DialogContent className="w-[96vw] max-w-3xl p-0">
                <DialogHeader className="px-6 pt-6 pb-2">
                    <DialogTitle>Summary Column Explanations</DialogTitle>
                    <DialogDescription>How each value in the summary table is calculated.</DialogDescription>
                </DialogHeader>
                <div className="px-6 pb-6 etf-dialog-scroll max-h-[65vh] overflow-y-auto space-y-4">
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
                        <p className="text-muted-foreground">This shows the allocation of your portfolio&apos;s value. It has two modes:</p>
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
            userId={userId}
          />
        )}
        </TooltipProvider>
    );
}

export default forwardRef(PortfolioSummaryImpl);
