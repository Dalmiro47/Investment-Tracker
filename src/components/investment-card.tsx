
import { useState, useEffect } from 'react';
import type { Investment } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Bitcoin, CandlestickChart, Home, Landmark, TrendingDown, TrendingUp, Wallet, Briefcase, MoreVertical, Trash2, Edit, History, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { dec, toNum, formatCurrency, formatQty, formatPercent, div, mul, sub, add } from '@/lib/money';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Button } from './ui/button';

interface InvestmentCardProps {
  investment: Investment;
  isTaxView: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onViewHistory: () => void;
  onAddTransaction: () => void;
}

const typeIcons: Record<Investment['type'], React.ReactNode> = {
  Stock: <CandlestickChart className="h-6 w-6" />,
  Bond: <Landmark className="h-6 w-6" />,
  Crypto: <Bitcoin className="h-6 w-6" />,
  'Real Estate': <Home className="h-6 w-6" />,
  ETF: <Briefcase className="h-6 w-6" />,
  Savings: <Wallet className="h-6 w-6" />,
};

export default function InvestmentCard({ investment, isTaxView, onEdit, onDelete, onViewHistory, onAddTransaction }: InvestmentCardProps) {
  const { name, type, status, ticker, purchaseDate, realizedProceeds, realizedPnL, dividends, interest } = investment;
  
  // --- High-Precision Calculations ---
  const purchasePrice = dec(investment.purchasePricePerUnit);
  const currentPrice = dec(investment.currentValue);
  const purchaseQty = dec(investment.purchaseQuantity);
  const soldQty = dec(investment.totalSoldQty);
  
  const availableQty = sub(purchaseQty, soldQty);
  const totalCost = mul(purchaseQty, purchasePrice);
  
  const marketValue = mul(availableQty, currentPrice);

  const unrealizedPL = mul(availableQty, sub(currentPrice, purchasePrice));
  const totalPL = add(unrealizedPL, dec(realizedPnL));
  
  const performance = div(totalPL, totalCost);

  const avgSellPrice = div(dec(realizedProceeds), soldQty);
  
  const totalIncome = add(dec(dividends ?? 0), dec(interest ?? 0));
  const totalTaxable = add(dec(realizedPnL), totalIncome);

  // --- Display-ready values (rounded) ---
  const displayTotalCost = toNum(totalCost);
  const displayMarketValue = toNum(marketValue);
  const displayRealizedValue = toNum(dec(realizedProceeds));
  const displayUnrealizedPL = toNum(unrealizedPL);
  const displayRealizedPL = toNum(dec(realizedPnL));
  const displayTotalPL = toNum(totalPL);
  const displayAvgSellPrice = toNum(avgSellPrice);

  return (
    <Card className="flex flex-col transition-all hover:shadow-lg hover:-translate-y-1">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-secondary rounded-md text-primary">{typeIcons[type]}</span>
            <div>
              <CardTitle className="font-headline text-xl">{name}</CardTitle>
              <CardDescription className="font-medium text-primary">{type} {ticker ? `(${ticker})` : ''}</CardDescription>
            </div>
          </div>
           <div className="flex items-center gap-2">
            <Badge variant={status === 'Active' ? 'default' : 'secondary'} className={cn(status === 'Active' && 'bg-green-600 text-white')}>{status}</Badge>
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
              <span className="text-muted-foreground">Realized P/L</span>
              <span className="font-mono font-semibold">{formatCurrency(displayRealizedPL)}</span>
            </div>
             <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Dividends/Interest</span>
              <span className="font-mono font-semibold">{formatCurrency(toNum(totalIncome))}</span>
            </div>
             <div className="flex justify-between items-center text-primary font-bold">
              <span className="">Total Taxable</span>
              <span className="font-mono">{formatCurrency(toNum(totalTaxable))}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
             <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col items-center justify-center p-3 bg-secondary/50 rounded-md">
                    <span className="text-xs text-muted-foreground">Total Cost</span>
                    <span className="font-headline text-xl font-bold">{formatCurrency(displayTotalCost)}</span>
                </div>
                 <div className="flex flex-col items-center justify-center p-3 bg-primary/10 rounded-md">
                    <span className="text-xs text-muted-foreground">{status === 'Sold' ? 'Realized Value' : 'Market Value'}</span>
                    <span className="font-headline text-xl font-bold text-primary">{formatCurrency(status === 'Sold' ? displayRealizedValue : displayMarketValue)}</span>
                </div>
            </div>

            <div className="text-sm border-t border-b py-2">
                <div className="flex justify-around">
                    <div className="text-center">
                        <p className="text-muted-foreground">Bought</p>
                        <p className="font-mono font-semibold">{formatQty(purchaseQty)}</p>
                    </div>
                     <div className="text-center">
                        <p className="text-muted-foreground">Sold</p>
                        <p className="font-mono font-semibold">{formatQty(soldQty)}</p>
                    </div>
                     <div className="text-center">
                        <p className="text-muted-foreground">Available</p>
                        <p className="font-mono font-semibold">{formatQty(availableQty)}</p>
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
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
              <div>
                <div className="text-sm text-muted-foreground">Unrealized P/L</div>
                <div className={cn("flex items-center font-bold text-lg", displayUnrealizedPL >= 0 ? "text-green-600" : "text-destructive")}>
                  {displayUnrealizedPL >= 0 ? <TrendingUp className="h-5 w-5 mr-1" /> : <TrendingDown className="h-5 w-5 mr-1" />}
                  {formatCurrency(displayUnrealizedPL)}
                </div>
              </div>
               <div className="text-right">
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
      {purchaseDate && (
        <CardFooter className="text-xs text-muted-foreground pt-4">
            Purchased on {format(parseISO(purchaseDate), 'dd MMM yyyy')}
        </CardFooter>
      )}
    </Card>
  );
}
