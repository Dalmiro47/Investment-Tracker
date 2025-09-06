
"use client";

import { useState } from 'react';
import type { Investment, TaxSettings } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Bitcoin, CandlestickChart, Home, Landmark, TrendingDown, TrendingUp, Wallet, Briefcase, MoreVertical, Trash2, Edit, History, PlusCircle, Info, PiggyBank } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { dec, toNum, formatCurrency, formatQty, formatPercent, div, mul, sub, add } from '@/lib/money';
import { getCryptoTaxInfo, estimateCardTax } from '@/lib/tax';
import { performancePct as calculatePerformancePct } from '@/lib/types';
import type { PositionMetrics } from '@/lib/portfolio';

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
  realizedPLYear: number;
  dividendsYear: number;
  interestYear: number;
  currentRatePct?: number | null;
  onManageRates?: () => void;
}

const typeIcons: Record<Investment['type'], React.ReactNode> = {
  Stock: <CandlestickChart className="h-6 w-6" />,
  Bond: <Landmark className="h-6 w-6" />,
  Crypto: <Bitcoin className="h-6 w-6" />,
  'Real Estate': <Home className="h-6 w-6" />,
  ETF: <Briefcase className="h-6 w-6" />,
  'Interest Account': <PiggyBank className="h-6 w-6" />,
};

export default function InvestmentCard({ 
  investment, 
  metrics,
  isTaxView, 
  onEdit, 
  onDelete, 
  onViewHistory, 
  onAddTransaction,
  taxSettings,
  realizedPLYear,
  dividendsYear,
  interestYear,
  currentRatePct,
  onManageRates,
}: InvestmentCardProps) {
  const { name, type, status, ticker, purchaseDate, realizedPnL } = investment;
  
  const isIA = investment.type === 'Interest Account';

  // --- High-Precision Calculations for non-IA ---
  const purchasePrice = dec(investment.purchasePricePerUnit);
  const currentPrice = dec(investment.currentValue);
  const purchaseQty = dec(investment.purchaseQuantity);
  const soldQty = dec(investment.totalSoldQty);
  
  const availableQty = sub(purchaseQty, soldQty).round(8);
  const costBasisNonIA = mul(availableQty, purchasePrice);
  const marketValueNonIA = mul(availableQty, currentPrice);

  const unrealizedPLNonIA = sub(marketValueNonIA, costBasisNonIA);
  const totalPLNonIA = add(unrealizedPLNonIA, dec(realizedPnL));
  
  const performanceNonIA = div(totalPLNonIA, mul(purchaseQty, purchasePrice));

  const avgSellPrice = div(dec(investment.realizedProceeds), soldQty);
  
  // --- IA values come from metrics ----
  const netDeposits  = isIA ? (metrics?.purchaseValue  ?? 0) : 0;
  const balance      = isIA ? (metrics?.marketValue    ?? 0) : 0;
  const accrued      = isIA ? (metrics?.unrealizedPL   ?? 0) : 0;
  const perf         = isIA ? (metrics?.performancePct ?? 0) : 0;
  
  // --- Display-ready values (rounded) ---
  const displayCostBasis = toNum(costBasisNonIA);
  const displayMarketValue = toNum(marketValueNonIA);
  const displayRealizedValue = toNum(dec(investment.realizedProceeds));
  const displayUnrealizedPL = toNum(unrealizedPLNonIA);
  const displayRealizedPL = toNum(realizedPnL);
  const displayTotalPL = toNum(totalPLNonIA);
  const displayAvgSellPrice = toNum(avgSellPrice);
  const performance = isIA ? perf : toNum(performanceNonIA);

  const isCrypto = investment.type === 'Crypto';
  const cryptoTax = isCrypto ? getCryptoTaxInfo(investment) : null;
  
  const estimatedTax = taxSettings ? estimateCardTax(
    {
      type: investment.type,
      realizedPL: realizedPLYear,
      dividends: dividendsYear,
      interest: interestYear,
      purchaseDate: investment.purchaseDate
    },
    taxSettings
  ) : null;
  
  const totalTaxable = realizedPLYear + dividendsYear + interestYear;

  const Stat = ({ label, value, trend }: { label: string, value: string, trend?: 'up' | 'down' }) => (
    <div className="flex flex-col items-center justify-center p-3 bg-secondary/50 rounded-md text-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("font-headline text-xl font-bold flex items-center gap-1", trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-destructive' : '')}>
        {trend === 'up' && <TrendingUp className="h-5 w-5" />}
        {trend === 'down' && <TrendingDown className="h-5 w-5" />}
        {value}
      </span>
    </div>
  );


  return (
    <Card className="flex flex-col transition-all hover:shadow-lg hover:-translate-y-1">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-secondary rounded-md text-primary">{typeIcons[type]}</span>
            <div>
              <CardTitle className="font-headline text-xl">{name}</CardTitle>
              <CardDescription className="font-medium text-primary">
                {type} {ticker ? `(${ticker})` : ""}
                {isIA && typeof currentRatePct === "number" ? ` • ${currentRatePct.toFixed(2)}%` : ""}
              </CardDescription>
            </div>
          </div>
           <div className="flex items-center gap-1">
            <Badge variant={status === 'Active' ? 'default' : 'secondary'} className={cn(status === 'Active' && 'bg-green-600 text-white')}>{status}</Badge>
            <Dialog>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Info className="h-4 w-4" />
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Field Explanations</DialogTitle>
                        <DialogDescription>Here's how each value on the card is calculated.</DialogDescription>
                    </DialogHeader>
                    <div className="text-sm space-y-4 max-h-[70vh] overflow-y-auto pr-4">
                        <div>
                            <h4 className="font-semibold">Cost Basis</h4>
                            <p className="text-muted-foreground">The original purchase price of the assets you currently still own. It ignores the cost of shares you've already sold. <br/><code className="text-xs">Formula: Available Quantity × Original Purchase Price per Unit</code></p>
                        </div>
                         <div>
                            <h4 className="font-semibold">Market Value</h4>
                            <p className="text-muted-foreground">The current value of the shares/units you still hold. <br/><code className="text-xs">Formula: Available Quantity × Current Price</code></p>
                        </div>
                        <div>
                            <h4 className="font-semibold">Bought, Sold, Available</h4>
                            <p className="text-muted-foreground"><span className="font-medium text-foreground">Bought:</span> The total quantity you initially purchased. <br/><span className="font-medium text-foreground">Sold:</span> The total quantity you have sold via transactions. <br/><span className="font-medium text-foreground">Available:</span> The quantity you currently still hold (`Bought - Sold`).</p>
                        </div>
                        <div>
                            <h4 className="font-semibold">Buy Price, Avg. Sell Price, Current Price</h4>
                            <p className="text-muted-foreground"><span className="font-medium text-foreground">Buy Price:</span> The price per unit you paid at the initial purchase. <br/><span className="font-medium text-foreground">Avg. Sell Price:</span> The weighted average price of all your sales (`Total Sale Proceeds / Total Quantity Sold`). <br/><span className="font-medium text-foreground">Current Price:</span> The latest market price for one unit.</p>
                        </div>
                        <div>
                            <h4 className="font-semibold">Unrealized P/L</h4>
                            <p className="text-muted-foreground">Your "paper" profit or loss on the assets you still hold. <br/><code className="text-xs">Formula: (Current Price - Buy Price) × Available Quantity</code></p>
                        </div>
                        <div>
                            <h4 className="font-semibold">Realized P/L</h4>
                            <p className="text-muted-foreground">Your "locked-in" profit or loss from all completed sales. This value is filtered by the year you select in the summary. <br/><code className="text-xs">Formula: (Avg. Sell Price - Buy Price) × Sold Quantity</code></p>
                        </div>
                         <div>
                            <h4 className="font-semibold">Total P/L (Performance)</h4>
                            <p className="text-muted-foreground">The overall profit or loss, combining realized and unrealized amounts. The percentage shows the total return on your original investment. <br/><code className="text-xs">Total P/L Formula: Unrealized P/L + Realized P/L</code> <br/> <code className="text-xs">Performance % Formula: Total P/L / Total Cost</code></p>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
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
      </CardHeader>
      <CardContent className="flex-grow space-y-4">
        {isTaxView ? (
          <div className="space-y-3 rounded-md border p-4">
            <h4 className="font-semibold text-center text-muted-foreground">Tax Report View</h4>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Realized P/L (Year)</span>
              <span className="font-mono font-semibold">{formatCurrency(realizedPLYear)}</span>
            </div>
             <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Dividends/Interest (Year)</span>
              <span className="font-mono font-semibold">{formatCurrency(dividendsYear + interestYear)}</span>
            </div>
             <div className="flex justify-between items-center text-foreground font-bold border-t pt-2 mt-1">
              <span className="">Total Taxable Income (Year)</span>
              <span className="font-mono">{formatCurrency(totalTaxable)}</span>
            </div>
            {estimatedTax && (
              <div className="flex justify-between items-center text-primary font-bold border-t pt-2 mt-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1.5 cursor-help">
                          Estimated Tax Due (This Asset)
                          <Info className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-left">
                        <div className="font-normal text-sm space-y-1">
                          {estimatedTax.isTaxFree && (
                            <p className="font-semibold text-green-500">Potentially tax-free due to holding period.</p>
                          )}
                          <p><span className="font-semibold">Taxable Base:</span> {formatCurrency(estimatedTax.taxBase)}</p>
                          <p><span className="font-semibold">Tax Rate (est.):</span> {formatPercent(estimatedTax.taxRate)}</p>
                          <Separator className="my-1"/>
                          <p><span className="font-semibold">Income Tax:</span> {formatCurrency(estimatedTax.tax)}</p>
                          <p><span className="font-semibold">Solidarity Surcharge:</span> {formatCurrency(estimatedTax.soli)}</p>
                          <p><span className="font-semibold">Church Tax:</span> {formatCurrency(estimatedTax.church)}</p>
                          <Separator className="my-1"/>
                          <p className="text-xs text-muted-foreground pt-1 font-bold">Note: Portfolio-wide allowances/thresholds are applied in the main Tax Estimate report.</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                <span className="font-mono">{formatCurrency(estimatedTax.total)}</span>
              </div>
            )}
          </div>
        ) : isIA ? (
           <div className="grid grid-cols-2 gap-3">
            <Stat label="Net Deposits" value={formatCurrency(netDeposits)} />
            <Stat label="Balance" value={formatCurrency(balance)} />
            <Stat label="Accrued Interest" value={formatCurrency(accrued)} trend={accrued >= 0 ? 'up' : 'down'} />
            <Stat label="Performance" value={formatPercent(perf)} />
          </div>
        ) : (
          <div className="space-y-4">
             <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col items-center justify-center p-3 bg-secondary/50 rounded-md">
                    <span className="text-xs text-muted-foreground">Cost Basis</span>
                    <span className="font-headline text-xl font-bold">{formatCurrency(displayCostBasis)}</span>
                </div>
                 <div className="flex flex-col items-center justify-center p-3 bg-primary/10 rounded-md">
                    <span className="text-xs text-muted-foreground">{status === 'Sold' ? 'Realized Value' : 'Market Value'}</span>
                    <span className="font-headline text-xl font-bold text-primary">{formatCurrency(status === 'Sold' ? displayRealizedValue : displayMarketValue)}</span>
                </div>
            </div>

            <div className="text-sm border-t border-b py-2">
                 <div className="grid grid-cols-3 gap-x-4 text-center">
                    <div>
                        <p className="text-muted-foreground">Bought</p>
                        <p className="font-mono font-semibold">{formatQty(purchaseQty)}</p>
                    </div>
                     <div>
                        <p className="text-muted-foreground">Sold</p>
                        <p className="font-mono font-semibold">{formatQty(soldQty)}</p>
                    </div>
                     <div>
                        <p className="text-muted-foreground">Available</p>
                        <p className="font-mono font-semibold">{formatQty(availableQty)}</p>
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm text-center">
                <div className="space-y-1">
                    <p className="text-muted-foreground">Buy Price</p>
                    <p className="font-mono font-semibold">{formatCurrency(investment.purchasePricePerUnit)}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-muted-foreground">Avg. Sell Price</p>
                    <p className="font-mono font-semibold">{!soldQty.eq(0) ? formatCurrency(displayAvgSellPrice) : 'N/A'}</p>
                </div>
                 <div className="space-y-1">
                    <p className="text-muted-foreground">Current Price</p>
                    <p className="font-mono font-semibold">{formatCurrency(investment.currentValue ?? 0)}</p>
                </div>
            </div>
            
            <Separator />

            <div className="grid grid-cols-2 gap-4">
               <div className="text-center">
                  <div className="text-sm text-muted-foreground">Unrealized P/L</div>
                  <div className={cn("flex items-center justify-center font-bold text-lg", displayUnrealizedPL >= 0 ? "text-green-600" : "text-destructive")}>
                    {displayUnrealizedPL >= 0 ? <TrendingUp className="h-5 w-5 mr-1" /> : <TrendingDown className="h-5 w-5 mr-1" />}
                    {formatCurrency(displayUnrealizedPL)}
                  </div>
              </div>
               <div className="text-center">
                  <div className="text-sm text-muted-foreground">Realized P/L</div>
                  <div className={cn("font-bold text-lg", displayRealizedPL >= 0 ? "text-green-600" : "text-destructive")}>{formatCurrency(displayRealizedPL)}</div>
              </div>
            </div>

             <div className="text-center pt-2">
                <div className="text-sm text-muted-foreground">Total P/L (Performance)</div>
                <div className={cn("flex items-center justify-center font-bold text-xl", displayTotalPL >= 0 ? "text-green-600" : "text-destructive")}>
                  {formatCurrency(displayTotalPL)} ({formatPercent(performance)})
                </div>
              </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start text-xs text-muted-foreground pt-4">
          {purchaseDate && (
            <div>
                {isIA ? 'Started on ' : 'Purchased on '}{format(parseISO(purchaseDate), 'dd MMM yyyy')}
            </div>
          )}
          {isCrypto && cryptoTax?.taxFreeDate && (
            <div className="mt-1 flex items-center gap-2">
              {cryptoTax.isEligibleNow ? (
                <span className="text-green-600 font-medium">
                  ✓ Tax-free eligible now (since {format(cryptoTax.taxFreeDate, 'dd MMM yyyy')})
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
        </CardFooter>
    </Card>
  );
}
