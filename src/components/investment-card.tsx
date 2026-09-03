
"use client";

import { useState, useRef, useEffect } from 'react';
import type { Investment, TaxSettings } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bitcoin, CandlestickChart, Home, Landmark, TrendingDown, TrendingUp, Briefcase, MoreVertical, Trash2, Edit, History, PlusCircle, Info, PiggyBank } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { dec, toNum, formatCurrency, formatQty, formatPercent, div, mul, sub, add } from '@/lib/money';
import { getCryptoTaxInfo, estimateCardTax, TAX } from '@/lib/tax';
import { performancePct as calculatePerformancePct } from '@/lib/types';
import type { PositionMetrics, YearTaxSummary } from '@/lib/portfolio';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface InvestmentCardProps {
  investment: Investment;
  metrics?: PositionMetrics;
  isTaxView: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onViewHistory: () => void;
  onAddTransaction: () => void;
  taxSettings: TaxSettings | null;
  taxSummary?: YearTaxSummary | null;
  realizedPLYear: number;
  dividendsYear: number;
  interestYear: number;
  currentRatePct?: number | null;
  onManageRates?: () => void;
  soldOn?: string | null;
}

const typeIcons: Record<Investment['type'], React.ReactNode> = {
  Stock: <CandlestickChart className="h-5 w-5" />,
  Bond: <Landmark className="h-5 w-5" />,
  Crypto: <Bitcoin className="h-5 w-5" />,
  Future: <CandlestickChart className="h-5 w-5" />,
  'Real Estate': <Home className="h-5 w-5" />,
  ETF: <Briefcase className="h-5 w-5" />,
  'Interest Account': <PiggyBank className="h-5 w-5" />,
};

/** Small label/value tile — the card's `stat` vocabulary. */
function Stat({ label, value, trend }: { label: string; value: string; trend?: 'up' | 'down' }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[10px] border border-border bg-black/[.28] p-3">
      <span className="text-[11px] font-semibold uppercase tracking-[.04em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'truncate font-mono text-[15px] font-semibold tabular-nums',
          trend === 'up' && 'gain',
          trend === 'down' && 'loss'
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Inline label/value pair (no box) for the dense quantity / price rows. */
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[.04em] text-muted-foreground">
        {label}
      </div>
      <div className="truncate font-mono text-[13px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** Rounded perf chip used in the card footer. */
function PerfChip({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span
      className={cn(
        'inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-bold',
        up
          ? 'border-success/30 bg-success/[.12] text-success'
          : 'border-destructive/30 bg-destructive/[.12] text-destructive'
      )}
    >
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      <span className="font-mono tabular-nums">{formatPercent(pct)}</span>
    </span>
  );
}

export default function InvestmentCard({
  investment,
  metrics,
  isTaxView,
  onEdit,
  onDelete,
  onViewHistory,
  onAddTransaction,
  taxSettings,
  taxSummary,
  realizedPLYear,
  dividendsYear,
  interestYear,
  currentRatePct,
  onManageRates,
  soldOn,
}: InvestmentCardProps) {
  const debugRenderCount = useRef(0);
  debugRenderCount.current += 1;

  // If the card renders more than 200 times, it throws an error.
  // This STOPS the freeze and shows you a stack trace in the browser.
  if (debugRenderCount.current > 200) {
    throw new Error("Infinite Loop detected in InvestmentCard!");
  }

  useEffect(() => {
      // Reset counter if we successfully render and stay idle
      const t = setTimeout(() => { debugRenderCount.current = 0; }, 500);
      return () => clearTimeout(t);
  });

  const { name, type, status, ticker, purchaseDate, realizedPnL, exchange } = investment;
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const isIA = investment.type === 'Interest Account';
  const isETF = investment.type === 'ETF';

  // --- High-Precision Calculations for non-IA ---
  const purchasePrice = dec(investment.purchasePricePerUnit);
  const currentPrice = dec(investment.currentValue);
  const purchaseQty = dec(investment.purchaseQuantity);
  const soldQty = dec(investment.totalSoldQty);

  const availableQty = sub(purchaseQty, soldQty).round(8);
  const costBasisNonIA = mul(availableQty, purchasePrice);

  // NEW: Calculate the cost basis of the sold portion
  const soldCostBasis = mul(soldQty, purchasePrice);

  const marketValueNonIA = mul(availableQty, currentPrice);

  const unrealizedPLNonIA = sub(marketValueNonIA, costBasisNonIA);
  const totalPLNonIA = add(unrealizedPLNonIA, dec(realizedPnL));

  const performanceNonIA = div(totalPLNonIA, mul(purchaseQty, purchasePrice));

  const avgSellPrice = div(dec(investment.realizedProceeds), soldQty);

  // --- IA values come from metrics ----
  const netDeposits  = metrics?.purchaseValue  ?? 0;
  const balance      = metrics?.marketValue    ?? 0;
  const accrued      = metrics?.unrealizedPL   ?? 0;
  const perf         = metrics?.performancePct ?? 0;

  // --- Display-ready values (rounded) ---
  const displayCostBasis = toNum(costBasisNonIA);
  const displaySoldCostBasis = toNum(soldCostBasis); // NEW
  const displayMarketValue = toNum(marketValueNonIA);
  const displayRealizedValue = toNum(dec(investment.realizedProceeds));
  const displayUnrealizedPL = toNum(unrealizedPLNonIA);
  const displayRealizedPL = toNum(realizedPnL);
  const displayTotalPL = toNum(totalPLNonIA);
  const displayAvgSellPrice = toNum(avgSellPrice);
  const performance = isIA ? perf : toNum(performanceNonIA);

  const isCrypto = investment.type === 'Crypto';
  const cryptoTax = isCrypto ? getCryptoTaxInfo(investment) : null;

  const totalTaxable = realizedPLYear + dividendsYear + interestYear;

  // ---- Capital income (stocks/ETFs/bonds/interest) allowance-aware estimate ----
  const isCapitalAsset =
    investment.type === 'Stock' ||
    investment.type === 'ETF' ||
    investment.type === 'Bond' ||
    investment.type === 'Interest Account';

  let allowanceAwareTaxDue = 0;
  let expl: { capitalIncome: number; allowanceApplied: number; taxableBase: number; baseTax: number; soli: number; church: number } | null = null;
  let estimatedTaxForCard = 0;

  if (isTaxView && taxSettings) {
      if (isCapitalAsset && taxSummary) {
        const capital = taxSummary.capitalTaxResult;
        const remainingAllowance = Math.max(0, (capital.allowance ?? 0) - (capital.allowanceUsed ?? 0));

        const capitalIncomeThisAsset =
          (realizedPLYear ?? 0) + (dividendsYear ?? 0) + (interestYear ?? 0);

        const allowanceApplied = Math.min(remainingAllowance, Math.max(0, capitalIncomeThisAsset));
        const taxableBase = Math.max(0, capitalIncomeThisAsset - allowanceApplied);

        const baseTax = taxableBase * TAX.abgeltungsteuer;
        const soli    = baseTax * TAX.soliRate;
        const church  = baseTax * (taxSettings.churchTaxRate ?? 0);

        allowanceAwareTaxDue = baseTax + soli + church;
        estimatedTaxForCard = allowanceAwareTaxDue;
        expl = { capitalIncome: capitalIncomeThisAsset, allowanceApplied, taxableBase, baseTax, soli, church };
      } else if (investment.type === 'Crypto') {
        const cryptoEstimate = estimateCardTax({ type: 'Crypto', realizedPL: realizedPLYear, dividends: 0, interest: 0, purchaseDate: investment.purchaseDate }, taxSettings);
        estimatedTaxForCard = cryptoEstimate.total;
        expl = null;
      }
  }

  const isSold = status === 'Sold';

  // Sub-line: "{type} · {ticker} · {rate} · {exchange}"
  const subParts = [
    type,
    ticker || null,
    isIA && typeof currentRatePct === 'number' ? `${currentRatePct.toFixed(2)}% p.a.` : null,
    exchange || null,
  ].filter(Boolean) as string[];

  // Footer left-hand summary: "qty × price"
  const qtyPriceLabel = isIA
    ? null
    : isSold
      ? `${formatQty(soldQty)} × ${!soldQty.eq(0) ? formatCurrency(displayAvgSellPrice) : formatCurrency(investment.purchasePricePerUnit)}`
      : `${formatQty(availableQty)} × ${formatCurrency(investment.currentValue ?? 0)}`;

  const footerPL = isIA ? accrued : displayTotalPL;

  return (
    <>
    <Card className="flex flex-col gap-3.5 p-[18px] transition-all hover:-translate-y-0.5 hover:border-white/[.12]">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-primary/20 bg-primary/10 text-primary">
            {typeIcons[type]}
          </span>
          <div className="min-w-0">
            <div className="truncate font-headline text-[17px] font-bold leading-tight tracking-tight">
              {name}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {subParts.join(' · ')}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isCrypto && cryptoTax?.isEligibleNow && (
            <Badge variant="warning">Tax-free</Badge>
          )}
          <Badge variant={status === 'Active' ? 'success' : 'secondary'}>
            <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
            {status}
          </Badge>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsInfoOpen(true)}>
              <Info className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
               <DropdownMenuItem onClick={onAddTransaction}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Transaction
              </DropdownMenuItem>
               <DropdownMenuItem onClick={onViewHistory}>
                <History className="mr-2 h-4 w-4" />
                View History
              </DropdownMenuItem>
              {isIA && onManageRates && (
                <DropdownMenuItem onClick={onManageRates}>
                  <History className="mr-2 h-4 w-4" />
                  Manage Rates
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Investment
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-grow">
        {isTaxView ? (
          <div className="space-y-3">
            <span className="eyebrow">Tax report view</span>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Realized P/L (Year)" value={formatCurrency(realizedPLYear)} />
              <Stat label="Dividends / Interest" value={formatCurrency(dividendsYear + interestYear)} />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2.5 text-[13px] font-semibold text-foreground">
              <span>Total Taxable Income (Year)</span>
              <span className="font-mono tabular-nums">{formatCurrency(totalTaxable)}</span>
            </div>
            {taxSettings && (
              <div className="flex items-center justify-between border-t border-border pt-2.5 text-[13px] font-semibold text-warning">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex cursor-help items-center gap-1.5">
                          Estimated Tax Due (This Asset)
                          <Info className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-sm">
                        {isCapitalAsset && expl ? (
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span>Capital Income (this asset)</span>
                              <span className="font-mono">{formatCurrency(expl.capitalIncome)}</span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Allowance Applied</span>
                              <span className="font-mono">- {formatCurrency(expl.allowanceApplied)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-medium">Taxable Base</span>
                              <span className="font-mono">{formatCurrency(expl.taxableBase)}</span>
                            </div>
                            <div className="my-1 border-t border-border" />
                            <div className="flex justify-between text-xs">
                              <span>Base Tax ({formatPercent(TAX.abgeltungsteuer)})</span>
                              <span className="font-mono">{formatCurrency(expl.baseTax)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span>Solidarity ({formatPercent(TAX.soliRate)})</span>
                              <span className="font-mono">{formatCurrency(expl.soli)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span>Church Tax ({taxSettings?.churchTaxRate ? formatPercent(taxSettings.churchTaxRate) : '0%'})</span>
                              <span className="font-mono">{formatCurrency(expl.church)}</span>
                            </div>
                            <div className="my-1 border-t border-border" />
                            <div className="flex justify-between font-semibold">
                              <span>Estimated Tax (this asset)</span>
                              <span className="font-mono">{formatCurrency(allowanceAwareTaxDue)}</span>
                            </div>
                            <p className="mt-1 border-t border-border pt-1 text-xs text-muted-foreground">
                              Uses your remaining annual capital gains allowance before applying taxes. Final tax depends on your full-year totals.
                            </p>
                          </div>
                        ) : isCrypto ? (
                            <div className="space-y-1 text-sm font-normal">
                                <p className="font-semibold text-success">Crypto tax is based on personal income rate.</p>
                                <p>This estimate uses the global setting. See the main Tax Estimate dialog for a full breakdown.</p>
                            </div>
                        ) : null}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                <span className="font-mono tabular-nums">{formatCurrency(estimatedTaxForCard)}</span>
              </div>
            )}
          </div>
        ) : isIA ? (
           <div className="grid grid-cols-2 gap-2">
            <Stat label="Net Deposits" value={formatCurrency(netDeposits)} />
            <Stat label="Balance" value={formatCurrency(balance)} />
            <Stat label="Accrued Interest" value={formatCurrency(accrued)} trend={accrued >= 0 ? 'up' : 'down'} />
            <Stat label="Performance" value={formatPercent(perf)} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label={isSold ? 'Original Cost' : 'Cost Basis'}
                value={formatCurrency(isSold ? displaySoldCostBasis : displayCostBasis)}
              />
              <Stat
                label={isSold ? 'Proceeds' : 'Market Value'}
                value={formatCurrency(isSold ? displayRealizedValue : displayMarketValue)}
              />
            </div>

            <div className="grid grid-cols-3 gap-x-3 border-y border-border py-2.5">
              <Mini label="Bought" value={formatQty(purchaseQty)} />
              <Mini label="Sold" value={formatQty(soldQty)} />
              <Mini label="Available" value={formatQty(availableQty)} />
            </div>

            <div className="grid grid-cols-3 gap-x-3">
              <Mini label="Buy Price" value={formatCurrency(investment.purchasePricePerUnit)} />
              <Mini
                label="Avg. Sell"
                value={!soldQty.eq(0) ? formatCurrency(displayAvgSellPrice) : 'N/A'}
              />
              {!isSold && (
                <Mini label="Current" value={formatCurrency(investment.currentValue ?? 0)} />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="Unrealized P/L"
                value={formatCurrency(displayUnrealizedPL)}
                trend={displayUnrealizedPL >= 0 ? 'up' : 'down'}
              />
              <Stat
                label="Realized P/L"
                value={formatCurrency(displayRealizedPL)}
                trend={displayRealizedPL >= 0 ? 'up' : 'down'}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 text-[12px] text-muted-foreground">
            {(qtyPriceLabel || purchaseDate) && (
              <div className="truncate">
                {qtyPriceLabel && (
                  <span className="font-mono tabular-nums">{qtyPriceLabel}</span>
                )}
                {qtyPriceLabel && purchaseDate && ' · '}
                {purchaseDate &&
                  `${isIA ? 'Started' : 'Bought'} ${format(parseISO(purchaseDate), 'dd MMM yyyy')}`}
              </div>
            )}
            {isSold && soldOn && (
              <div className="truncate">Sold {format(parseISO(soldOn), 'dd MMM yyyy')}</div>
            )}
          </div>
          {!isTaxView && (
            <div className="flex shrink-0 items-center gap-2.5">
              <span
                className={cn(
                  'font-mono text-[15px] font-bold tabular-nums',
                  footerPL >= 0 ? 'gain' : 'loss'
                )}
              >
                {formatCurrency(footerPL)}
              </span>
              <PerfChip pct={performance} />
            </div>
          )}
        </div>
        {isCrypto && cryptoTax?.taxFreeDate && (
          <div className="text-[12px]">
            {cryptoTax.isEligibleNow ? (
              <span className="font-medium text-success">
                Tax-free eligible now (since {format(cryptoTax.taxFreeDate, 'dd MMM yyyy')})
              </span>
            ) : (
              <span className="text-muted-foreground">
                Can be sold without taxes from {format(cryptoTax.taxFreeDate, 'dd MMM yyyy')}
                {typeof cryptoTax.daysUntilEligible === 'number' &&
                  cryptoTax.daysUntilEligible > 0 &&
                  ` (in ${cryptoTax.daysUntilEligible} days)`}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
    {/* Info Dialog */}
    <Dialog open={isInfoOpen} onOpenChange={setIsInfoOpen}>
      <DialogContent className="w-[96vw] max-w-3xl p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Field Explanations</DialogTitle>
          <DialogDescription>
            Here&apos;s how each value on the card is calculated for this
            investment type.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6 max-h-[65vh] overflow-y-auto space-y-4">
          {isIA ? (
            <div className="text-sm space-y-4">
              <div>
                <h4 className="font-semibold">Net Deposits</h4>
                <p className="text-muted-foreground">
                  The total amount of cash you have moved into this account,
                  minus any withdrawals. It is your principal investment.
                  <br />
                  <code className="text-xs">
                    Formula: Sum of all Deposits - Sum of all Withdrawals
                  </code>
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Balance</h4>
                <p className="text-muted-foreground">
                  The current total value of your account, including your
                  principal and any interest that has accrued over time.
                  <br />
                  <code className="text-xs">
                    Formula: Net Deposits + Accrued Interest
                  </code>
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Accrued Interest</h4>
                <p className="text-muted-foreground">
                  The total interest earned to date, calculated based on the
                  account&apos;s rate schedule and daily balances. This is
                  your &quot;unrealized&quot; gain.
                  <br />
                  <code className="text-xs">
                    Formula: Calculated daily via savings engine
                  </code>
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Performance</h4>
                <p className="text-muted-foreground">
                  The total return on your investment, shown as a percentage.
                  <br />
                  <code className="text-xs">
                    Formula: (Accrued Interest / Net Deposits) × 100
                  </code>
                </p>
              </div>
            </div>
          ) : (
            <div className="text-sm space-y-4">
              <div>
                <h4 className="font-semibold">Cost Basis</h4>
                <p className="text-muted-foreground">
                  The original purchase price of the assets you currently still
                  own. It ignores the cost of shares you&apos;ve already sold.
                  <br />
                  <code className="text-xs">
                    Formula: Available Quantity × Original Purchase Price per
                    Unit
                  </code>
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Market Value</h4>
                <p className="text-muted-foreground">
                  The current value of the shares/units you still hold. <br />
                  <code className="text-xs">
                    Formula: Available Quantity × Current Price
                  </code>
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Bought, Sold, Available</h4>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Bought:</span>{' '}
                  The total quantity you initially purchased. <br />
                  <span className="font-medium text-foreground">Sold:</span> The
                  total quantity you have sold via transactions. <br />
                  <span className="font-medium text-foreground">
                    Available:
                  </span>{' '}
                  The quantity you currently still hold (`Bought - Sold`).
                </p>
              </div>
              <div>
                <h4 className="font-semibold">
                  Buy Price, Avg. Sell Price, Current Price
                </h4>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Buy Price:
                  </span>{' '}
                  The price per unit you paid at the initial purchase. <br />
                  <span className="font-medium text-foreground">
                    Avg. Sell Price:
                  </span>{' '}
                  The weighted average price of all your sales (`Total Sale
                  Proceeds / Total Quantity Sold`). <br />
                  <span className="font-medium text-foreground">
                    Current Price:
                  </span>{' '}
                  The latest market price for one unit.
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Unrealized P/L</h4>
                <p className="text-muted-foreground">
                  Your &quot;paper&quot; profit or loss on the assets you
                  still hold. <br />
                  <code className="text-xs">
                    Formula: (Current Price - Buy Price) × Available Quantity
                  </code>
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Realized P/L</h4>
                <p className="text-muted-foreground">
                  Your &quot;locked-in&quot; profit or loss from all completed
                  sales. This value is filtered by the year you select in the
                  summary. <br />
                  <code className="text-xs">
                    Formula: (Avg. Sell Price - Buy Price) × Sold Quantity
                  </code>
                </p>
              </div>
              <div>
                <h4 className="font-semibold">Total P/L (Performance)</h4>
                <p className="text-muted-foreground">
                  The overall profit or loss, combining realized and unrealized
                  amounts. The percentage shows the total return on your
                  original investment. <br />
                  <code className="text-xs">
                    Total P/L Formula: Unrealized P/L + Realized P/L
                  </code>{' '}
                  <br />{' '}
                  <code className="text-xs">
                    Performance % Formula: Total P/L / Total Cost
                  </code>
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
