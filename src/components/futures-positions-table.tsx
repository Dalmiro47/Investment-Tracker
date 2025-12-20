// components/futures-positions-table.tsx
"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { format } from "date-fns";
import type { FuturePosition } from "@/lib/types";
import { useFuturesPositions } from "@/hooks/useFuturesPositions";
import { useKrakenTaxData } from "@/hooks/useKrakenTaxData";
import { syncKrakenFutures } from "@/app/actions/kraken-sync";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/money";
import { useAuth } from "@/hooks/use-auth";
import { RefreshCw } from "lucide-react";

type Props = {
  positions?: FuturePosition[];
  useMockData?: boolean;
  userId?: string | null;
  statusFilter?: 'All' | 'OPEN' | 'CLOSED' | 'LIQUIDATED';
};

export default function FuturesPositionsTable({ positions, useMockData = true, userId, statusFilter = 'All' }: Props) {
  const { user } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const enabledHook = !positions;
  const { positions: hookPositions, loading, error } = useFuturesPositions({
    userId: userId ?? user?.uid,
    useMockData,
  });

  const rows: FuturePosition[] = (positions ?? hookPositions).filter(pos => {
    if (statusFilter === 'All') return true;
    return pos.status === statusFilter;
  });
  const currentUserId = userId ?? user?.uid;

  const handleSync = () => {
    if (!user) {
      setErrorMsg("You must be signed in to sync.");
      return;
    }
    startTransition(async () => {
      // SECURITY UPDATE: We do not pass keys here anymore!
      const res = await syncKrakenFutures(user.uid);
      if (!res.ok) setErrorMsg(res.message);
      else setErrorMsg(null);
    });
  };

  if (enabledHook && loading) return <div className="p-4 text-sm text-muted-foreground">Loading futures...</div>;

  return (
    <div className="mt-2 rounded-md border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-3 flex-wrap bg-muted/30">
        <div>
          <span className="font-semibold block">Kraken Futures</span>
          <span className="text-xs text-muted-foreground">Aggregated positions & funding fees (Tax §20)</span>
        </div>
        <div className="flex items-center gap-2">
          {errorMsg && <span className="text-xs text-destructive">{errorMsg}</span>}
          <Button size="sm" variant="outline" onClick={handleSync} disabled={isPending}>
            <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isPending && "animate-spin")} />
            {isPending ? "Syncing..." : "Sync Kraken"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="min-w-[900px] text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead className="text-right">Side</TableHead>
              <TableHead className="text-right">Entry (Avg)</TableHead>
              <TableHead className="text-right">Notional (EUR)</TableHead>
              {/* Grouped P&L Columns */}
              <TableHead className="text-right">Realized P&L</TableHead>
              <TableHead className="text-right">Unrealized P&L</TableHead>
              <TableHead className="text-right">Funding (Net)</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="h-24 text-center">No positions found. Sync with Kraken to populate.</TableCell></TableRow>
            ) : rows.map((pos) => (
              <FuturesRowWithTaxData key={pos.id} position={pos} userId={currentUserId} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Separate component to handle tax data fetching per row
function FuturesRowWithTaxData({ position, userId }: { position: FuturePosition; userId?: string | null }) {
  const taxData = useKrakenTaxData(userId || undefined, position.asset);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  // HEAVY LIFTING: Dynamic Currency Conversion
  const exchangeRate = position.exchangeRate || 0.85332;
  const entryPriceEur = position.entryPrice * exchangeRate;
  const notionalValueEur = position.collateral || (position.size * entryPriceEur);

  // German number formatting
  const formatEuro = (val: number) => 
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);

  useEffect(() => {
    let isMounted = true;

    const fetchPrice = async () => {
      try {
        // Normalize asset: "ETH/USD Perp" → "ETH"
        const cleanAsset = position.asset.split('/')[0].split(' ')[0].split('-')[0].toUpperCase();
        
        const response = await fetch(`/api/kraken/prices?asset=${cleanAsset}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch price: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Invalid response format');
        }

        const data = await response.json();
        if (isMounted) {
          setCurrentPrice(parseFloat(data.price));
        }
      } catch (error) {
        console.error('Error fetching price:', error);
        setCurrentPrice(null); // Reset price on error
      }
    };

    fetchPrice();

    const interval = setInterval(fetchPrice, 10000); // Refresh every 10 seconds
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [position.asset]);

  const unrealizedPnL = useMemo(() => {
    if (currentPrice === null) return null;

    const entryPrice = position.entryPrice;
    const size = position.size;
    const exchangeRate = position.exchangeRate;

    const pnl = (currentPrice - entryPrice) * size * exchangeRate;
    return position.side === 'SHORT' ? -pnl : pnl;
  }, [currentPrice, position.entryPrice, position.size, position.exchangeRate, position.side]);

  return (
    <TableRow>
      <TableCell className="font-medium">{position.asset}</TableCell>
      <TableCell className="text-right">
        <Badge variant="outline" className={position.side === 'LONG' ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30"}>
          {position.side}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <span className="font-semibold text-primary block">{formatEuro(entryPriceEur)}</span>
        <span className="text-[10px] text-muted-foreground">({position.entryPrice.toFixed(2)} USD)</span>
      </TableCell>
      <TableCell className="text-right">{formatEuro(notionalValueEur)}</TableCell>

      {/* Grouped P&L Data */}
      <TableCell className={cn("text-right font-mono", taxData.realizedPnlEur < 0 ? "text-red-500" : "text-emerald-500")}>
        {formatEuro(taxData.realizedPnlEur)}
      </TableCell>

      <TableCell className={cn("text-right font-mono", 
        unrealizedPnL === null ? "text-muted-foreground" : 
        unrealizedPnL < 0 ? "text-red-500" : "text-emerald-500",
        "animate-pulse" // Keep the live feedback pulse
      )}>
        {unrealizedPnL === null ? "-" : formatEuro(unrealizedPnL)}
      </TableCell>

      <TableCell className={cn("text-right font-mono", taxData.fundingNetEur < 0 ? "text-red-500" : "text-emerald-500")}>
        {formatEuro(taxData.fundingNetEur)}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground uppercase">{position.status}</TableCell>
    </TableRow>
  );
}
