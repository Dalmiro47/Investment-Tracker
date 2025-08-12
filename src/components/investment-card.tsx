
import { useState, useEffect } from 'react';
import type { Investment, Transaction } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Bitcoin, CandlestickChart, Home, Landmark, TrendingDown, TrendingUp, Wallet, Briefcase, MoreVertical, Trash2, Edit, ShieldCheck, History, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { getTransactions } from '@/lib/firestore';
import { aggregate, Agg } from '@/lib/utils/agg';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


interface InvestmentCardProps {
  investment: Investment;
  isTaxView: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onViewHistory: () => void;
}

const typeIcons: Record<Investment['type'], React.ReactNode> = {
  Stock: <CandlestickChart className="h-6 w-6" />,
  Bond: <Landmark className="h-6 w-6" />,
  Crypto: <Bitcoin className="h-6 w-6" />,
  'Real Estate': <Home className="h-6 w-6" />,
  ETF: <Briefcase className="h-6 w-6" />,
  Savings: <Wallet className="h-6 w-6" />,
};

const formatCurrency = (value: number | null | undefined, maximumFractionDigits = 2) => {
    if (value === null || value === undefined) {
        return 'N/A';
    }
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits }).format(value);
};

const formatNumber = (value: number | null | undefined, maximumFractionDigits = 4) => {
  if (value === null || value === undefined) {
    return 'N/A';
  }
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits }).format(value);
}

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'N/A';
  return `${(value * 100).toFixed(2)}%`;
}

export default function InvestmentCard({ investment, isTaxView, onEdit, onDelete, onViewHistory }: InvestmentCardProps) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [agg, setAgg] = useState<Agg | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      setLoading(true);
      const fetchedTransactions = await getTransactions(user.uid, investment.id);
      
      // Manually add initial "Buy" if not present
      const hasBuyTransaction = fetchedTransactions.some(t => t.type === 'Buy');
      if (!hasBuyTransaction) {
        fetchedTransactions.push({
          id: 'initial-buy',
          type: 'Buy',
          date: investment.purchaseDate,
          quantity: investment.initialValue > 0 ? (investment.totalCost ?? (investment.initialValue * investment.quantity)) / investment.initialValue : investment.quantity,
          pricePerUnit: investment.initialValue,
          totalAmount: investment.totalCost ?? (investment.initialValue * investment.quantity)
        });
        fetchedTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }
      
      setTransactions(fetchedTransactions);
      setAgg(aggregate(fetchedTransactions, investment.currentValue));
      setLoading(false);
    }
    fetchData();
  }, [investment, user]);
  

  const { name, type, status, ticker, purchaseDate, dividends, interest } = investment;

  if (loading || !agg) {
    return (
      <Card className="flex flex-col justify-between transition-all">
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
              <Badge variant='secondary' className="animate-pulse w-12 h-6"></Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
            <div className="flex justify-center items-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        </CardContent>
        {purchaseDate && (
            <CardFooter className="text-xs text-muted-foreground">
                Purchased on {format(new Date(purchaseDate), 'dd MMM yyyy')}
            </CardFooter>
      )}
      </Card>
    );
  }

  const isGain = agg.totalPL >= 0;
  const capitalGains = agg.realizedPL;
  const totalIncome = (dividends ?? 0) + (interest ?? 0);

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
                 <DropdownMenuItem onClick={onViewHistory}>
                  <History className="mr-2 h-4 w-4" />
                  View History
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEdit}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
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
              <span className="font-mono font-semibold">{formatCurrency(agg.realizedPL)}</span>
            </div>
             <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Dividends/Interest</span>
              <span className="font-mono font-semibold">{formatCurrency(totalIncome)}</span>
            </div>
             <div className="flex justify-between items-center text-primary font-bold">
              <span className="">Total Taxable</span>
              <span className="font-mono">{formatCurrency(agg.realizedPL + totalIncome)}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col items-center justify-center p-3 bg-secondary/50 rounded-md">
                    <span className="text-xs text-muted-foreground">Total Cost</span>
                    <span className="font-headline text-xl font-bold">{formatCurrency(agg.totalCost)}</span>
                </div>
                 <div className="flex flex-col items-center justify-center p-3 bg-primary/10 rounded-md">
                    <span className="text-xs text-muted-foreground">{status === 'Sold' ? 'Total Proceeds' : 'Market Value'}</span>
                    <span className="font-headline text-xl font-bold text-primary">{formatCurrency(status === 'Sold' ? agg.proceeds : agg.marketValue)}</span>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
                <div className="space-y-1">
                    <p className="text-muted-foreground">Avg. Buy Price</p>
                    <p className="font-mono font-semibold">{formatCurrency(agg.avgBuyPrice)}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-muted-foreground">Avg. Sell Price</p>
                    <p className="font-mono font-semibold">{agg.avgSellPrice > 0 ? formatCurrency(agg.avgSellPrice) : 'N/A'}</p>
                </div>
                 <div className="space-y-1">
                    <p className="text-muted-foreground">Current Price</p>
                    <p className="font-mono font-semibold">{formatCurrency(investment.currentValue)}</p>
                </div>
            </div>

            <div className="text-sm border-t border-b py-2">
                <div className="flex justify-around">
                    <div className="text-center">
                        <p className="text-muted-foreground">Bought</p>
                        <p className="font-mono font-semibold">{formatNumber(agg.buyQty)}</p>
                    </div>
                     <div className="text-center">
                        <p className="text-muted-foreground">Sold</p>
                        <p className="font-mono font-semibold">{formatNumber(agg.sellQty)}</p>
                    </div>
                     <div className="text-center">
                        <p className="text-muted-foreground">Available</p>
                        <p className="font-mono font-semibold">{formatNumber(agg.availableQty)}</p>
                    </div>
                </div>
            </div>

            {status === 'Active' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Unrealized P/L</div>
                    <div className={cn("flex items-center font-bold text-lg", agg.unrealizedPL >= 0 ? "text-green-600" : "text-destructive")}>
                      {agg.unrealizedPL >= 0 ? <TrendingUp className="h-5 w-5 mr-1" /> : <TrendingDown className="h-5 w-5 mr-1" />}
                      {formatCurrency(agg.unrealizedPL)}
                    </div>
                  </div>
                   <div className="text-right">
                    <div className="text-sm text-muted-foreground">Realized P/L</div>
                     <div className="font-bold text-lg">{formatCurrency(agg.realizedPL)}</div>
                  </div>
                </div>
            ) : (
                 <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Realized P/L</div>
                    <div className={cn("flex items-center font-bold text-lg", agg.realizedPL >= 0 ? "text-green-600" : "text-destructive")}>
                      {agg.realizedPL >= 0 ? <TrendingUp className="h-5 w-5 mr-1" /> : <TrendingDown className="h-5 w-5 mr-1" />}
                      {formatCurrency(agg.realizedPL)}
                    </div>
                  </div>
                   <div className="text-right">
                    <div className="text-sm text-muted-foreground">Performance</div>
                     <div className={cn("font-bold text-lg", isGain ? "text-green-600" : "text-destructive")}>
                        {formatPercent(agg.perfPct)}
                     </div>
                  </div>
                </div>
            )}
          </div>
        )}
      </CardContent>
      {purchaseDate && (
        <CardFooter className="text-xs text-muted-foreground pt-4">
            First purchased on {format(new Date(purchaseDate), 'dd MMM yyyy')}
        </CardFooter>
      )}
    </Card>
  );
}

