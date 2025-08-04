
import type { Investment } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Bitcoin, CandlestickChart, Home, Landmark, TrendingDown, TrendingUp, Wallet, Briefcase, MoreVertical, Trash2, Edit } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from './ui/button';

interface InvestmentCardProps {
  investment: Investment;
  isTaxView: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const typeIcons: Record<Investment['type'], React.ReactNode> = {
  Stock: <CandlestickChart className="h-6 w-6" />,
  Bond: <Landmark className="h-6 w-6" />,
  Crypto: <Bitcoin className="h-6 w-6" />,
  'Real Estate': <Home className="h-6 w-6" />,
  ETF: <Briefcase className="h-6 w-6" />,
  Savings: <Wallet className="h-6 w-6" />,
};

const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
        return 'N/A';
    }
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
};

export default function InvestmentCard({ investment, isTaxView, onEdit, onDelete }: InvestmentCardProps) {
  const { name, type, status, purchaseDate, initialValue, currentValue, quantity, dividends, interest, ticker } = investment;
  const initialTotal = initialValue * quantity;
  const currentTotal = currentValue ? currentValue * quantity : null;
  const gainLoss = currentTotal !== null ? currentTotal - initialTotal : null;
  const gainLossPercent = initialTotal === 0 || gainLoss === null ? 0 : (gainLoss / initialTotal) * 100;
  const isGain = gainLoss !== null ? gainLoss >= 0 : true;

  // Simplified annualized return
  const purchase = new Date(purchaseDate);
  const yearsHeld = (new Date().getTime() - purchase.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const annualizedReturn = yearsHeld > 0 && initialTotal > 0 && currentTotal !== null ? (Math.pow(currentTotal / initialTotal, 1 / yearsHeld) - 1) * 100 : gainLossPercent;


  const capitalGains = status === 'Sold' && gainLoss !== null ? gainLoss : 0;
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
              <span className="text-muted-foreground">Capital Gains</span>
              <span className="font-mono font-semibold">{formatCurrency(capitalGains)}</span>
            </div>
             <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Dividends/Interest</span>
              <span className="font-mono font-semibold">{formatCurrency(totalIncome)}</span>
            </div>
             <div className="flex justify-between items-center text-primary font-bold">
              <span className="">Total Taxable</span>
              <span className="font-mono">{formatCurrency(capitalGains + totalIncome)}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-baseline p-3 bg-secondary rounded-md">
              <span className="text-sm text-muted-foreground">Total Value</span>
              <span className="font-headline text-2xl font-bold text-primary">{formatCurrency(currentTotal)}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Initial</span>
                    <span className="font-mono font-semibold ml-auto">{formatCurrency(initialValue)}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Current</span>
                    <span className="font-mono font-semibold ml-auto">{formatCurrency(currentValue)}</span>
                </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Gain / Loss</div>
                <div className={cn("flex items-center font-bold text-lg", isGain ? "text-green-600" : "text-destructive")}>
                  {isGain ? <TrendingUp className="h-5 w-5 mr-1" /> : <TrendingDown className="h-5 w-5 mr-1" />}
                  {formatCurrency(gainLoss)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Performance</div>
                <div className={cn("font-bold text-lg", isGain ? "text-green-600" : "text-destructive")}>
                  {gainLossPercent.toFixed(2)}%
                </div>
              </div>
            </div>
             <div className="text-sm">
                <span className="text-muted-foreground">Annualized Return: </span>
                <span className={cn("font-bold", annualizedReturn >= 0 ? "text-green-500" : "text-destructive")}>{annualizedReturn.toFixed(2)}%</span>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        Purchased on {format(purchase, 'dd MMM yyyy')}
      </CardFooter>
    </Card>
  );
}
