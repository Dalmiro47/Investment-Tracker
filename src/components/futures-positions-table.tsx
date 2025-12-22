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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/money";
import { useAuth } from "@/hooks/use-auth";
import { RefreshCw, Info } from "lucide-react";

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
  const [isInfoOpen, setIsInfoOpen] = useState(false);

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
          <Button size="sm" variant="ghost" onClick={() => setIsInfoOpen(true)}>
            <Info className="h-4 w-4" />
          </Button>
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
              <TableHead className="text-right">Size</TableHead>
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
              <TableRow><TableCell colSpan={9} className="h-24 text-center">No positions found. Sync with Kraken to populate.</TableCell></TableRow>
            ) : rows.map((pos) => (
              <FuturesRowWithTaxData key={pos.id} position={pos} userId={currentUserId} />
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isInfoOpen} onOpenChange={setIsInfoOpen}>
        <DialogContent className="w-[96vw] max-w-3xl p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Futures Column Explanations</DialogTitle>
            <DialogDescription>How each value in the futures table is calculated.</DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 max-h-[65vh] overflow-y-auto space-y-4">
            <div>
              <h4 className="font-semibold">Asset</h4>
              <p className="text-muted-foreground">The cryptocurrency futures contract being traded (e.g., ETH/USD Perp, BTC/USD).</p>
            </div>
            <div>
              <h4 className="font-semibold">Side</h4>
              <p className="text-muted-foreground">The direction of your position:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
                <li><span className="font-semibold text-emerald-500">LONG:</span> You profit when the price goes up. Formula: (Current Price - Entry Price) × Size</li>
                <li><span className="font-semibold text-red-500">SHORT:</span> You profit when the price goes down. Formula: (Entry Price - Current Price) × Size</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold">Size</h4>
              <p className="text-muted-foreground">The quantity of the asset in your position. This represents the number of coins/contracts you&apos;re trading (e.g., 0.298 ETH, 550 ADA).<br/><code className="text-xs">This value is used in all P&L calculations</code></p>
            </div>
            <div>
              <h4 className="font-semibold">Entry (Avg)</h4>
              <p className="text-muted-foreground">Your average entry price for this position in EUR, with the original USD price shown below.<br/><code className="text-xs">Formula: Entry Price (USD) × Exchange Rate</code></p>
            </div>
            <div>
              <h4 className="font-semibold">Notional (EUR)</h4>
              <p className="text-muted-foreground">The total value of your position (the amount you&apos;re controlling with leverage).<br/><code className="text-xs">Formula: Size × Entry Price × Exchange Rate</code></p>
            </div>
            <div>
              <h4 className="font-semibold">Realized P&L</h4>
              <p className="text-muted-foreground">Profit or loss from closed positions. This is &quot;locked in&quot; and used for tax calculations under §20 German tax law.<br/><code className="text-xs">Fetched from Kraken API trade history</code></p>
            </div>
            <div>
              <h4 className="font-semibold">Unrealized P&L</h4>
              <p className="text-muted-foreground">Current floating profit or loss on open positions. This updates in real-time based on live market prices.</p>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
                <li><span className="font-semibold text-foreground">LONG:</span> <code className="text-xs">(Current Price - Entry Price) × Size × Exchange Rate</code></li>
                <li><span className="font-semibold text-foreground">SHORT:</span> <code className="text-xs">(Entry Price - Current Price) × Size × Exchange Rate</code></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold">Funding (Net)</h4>
              <p className="text-muted-foreground">The net funding fees paid or received on perpetual futures contracts. Negative values mean you paid fees; positive means you received fees. Included in tax calculations.<br/><code className="text-xs">Fetched from Kraken API funding history</code></p>
            </div>
            <div>
              <h4 className="font-semibold">Status</h4>
              <p className="text-muted-foreground">The current state of the position:</p>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
                <li><span className="font-semibold text-foreground">OPEN:</span> Position is active and tracking live P&L</li>
                <li><span className="font-semibold text-foreground">CLOSED:</span> Position was closed normally</li>
                <li><span className="font-semibold text-foreground">LIQUIDATED:</span> Position was forcibly closed due to insufficient margin</li>
              </ul>
            </div>
            <div className="pt-2">
              <h4 className="font-semibold">Tax Treatment (§20 German Tax Law)</h4>
              <p className="text-muted-foreground">Futures and derivatives are taxed differently from spot crypto holdings. All realized gains, losses, and funding fees are reported under §20 Kapitaleinkünfte (capital income) at a flat 26.375% rate (including solidarity surcharge), not under §23 private sales.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
        <span className="font-mono text-sm">{position.size.toFixed(4)}</span>
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
