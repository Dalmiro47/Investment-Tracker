// components/futures-positions-table.tsx
"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import type { FuturePosition } from "@/lib/types";
import { useFuturesPositions } from "@/hooks/useFuturesPositions";
import { useClosedPositions } from "@/hooks/useClosedPositions";
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

// Helper for dynamic price formatting (used in the component)
const formatEuroPrice = (val: number | undefined) => {
  if (val === undefined || val === null) return '—';
  // Matches USD logic: 4 digits if < 1, otherwise 2
  return new Intl.NumberFormat('de-DE', { 
    style: 'currency', 
    currency: 'EUR', 
    minimumFractionDigits: Math.abs(val) < 1 ? 4 : 2,
    maximumFractionDigits: Math.abs(val) < 1 ? 4 : 2
  }).format(val);
};

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
  
  // Also fetch closed positions
  const { positions: closedPositions, loading: closedLoading } = useClosedPositions(userId ?? user?.uid);

  // Consolidate positions by session ID to merge OPEN and CLOSED states
  const consolidatedPositions = useMemo(() => {
    if (positions) return positions; // Use provided positions if available
    
    const groups: Record<string, FuturePosition> = {};
    
    // Merge all documents by their session ID
    // OPEN positions provide full details, CLOSED updates add final P&L
    [...hookPositions, ...closedPositions].forEach(pos => {
      if (!groups[pos.id]) {
        groups[pos.id] = pos;
      } else {
        // Merge: CLOSED state overrides OPEN, but keep OPEN's positional details
        groups[pos.id] = {
          ...groups[pos.id],
          ...pos,
          // If transitioning to CLOSED, preserve entry details from the OPEN state
          entryPrice: groups[pos.id].entryPrice || pos.entryPrice,
          size: groups[pos.id].size || pos.size,
          side: groups[pos.id].side || pos.side,
          ticker: groups[pos.id].ticker || pos.ticker,
        };
      }
    });

    return Object.values(groups);
  }, [positions, hookPositions, closedPositions]);

  const rows: FuturePosition[] = consolidatedPositions.filter(pos => {
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

  if (enabledHook && (loading || closedLoading)) return <div className="p-4 text-sm text-muted-foreground">Loading futures...</div>;

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
        {/* Increased min-width slightly to accommodate the extra column */}
        <Table className="min-w-[1250px] text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead className="text-right">Side</TableHead>
              <TableHead className="text-right">Open Date</TableHead>
              <TableHead className="text-right">Closed Date</TableHead>
              <TableHead className="text-right">Holding Time</TableHead>
              <TableHead className="text-right">Size</TableHead>
              
              {/* SPLIT COLUMNS */}
              <TableHead className="text-right">Entry Price</TableHead>
              <TableHead className="text-right">Exit Price</TableHead>
              
              <TableHead className="text-right">Notional (EUR)</TableHead>
              <TableHead className="text-right">Realized P&L</TableHead>
              <TableHead className="text-right">Unrealized P&L</TableHead>
              <TableHead className="text-right">Fee</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={13} className="h-24 text-center">No positions found. Sync with Kraken to populate.</TableCell></TableRow>
            ) : rows.map((pos, index) => (
              <FuturesRowWithTaxData key={`${pos.id}-${index}`} position={pos} userId={currentUserId} />
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
  const assetName = position.asset || position.ticker || 'Unknown';
  const taxData = useKrakenTaxData(userId || undefined, assetName);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  const isOpenPosition = position.status === 'OPEN';
  const isClosed = position.status === 'CLOSED';
  const exchangeRate = position.exchangeRate || 0.85332;
  
  // Price Calculations
  const entryPriceEur = (position.entryPrice ?? 0) * exchangeRate;
  const exitPriceEur = (position.exitPrice ?? 0) * exchangeRate;
  
  const notionalValueEur = (position.collateral ?? 0) > 0 ? position.collateral! : ((position.size ?? 0) * entryPriceEur);

  // Standard formatter for P&L and Notional (always 2 decimals)
  const formatEuro = (val: number) => 
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);
  
  const formatUsdPrice = (price: number | undefined) => 
    price ? `$${price.toFixed(Math.abs(price) < 1 ? 4 : 2)}` : '—';

  // Helper for Firestore Timestamps or ISO strings
  const parseDate = (dateVal: any) => {
    if (!dateVal) return null;
    return new Date(dateVal instanceof Date ? dateVal : dateVal.toDate?.() || dateVal);
  };

  const openDate = parseDate(position.openedAt);
  const closedDate = parseDate(position.closedAt);

  // HEAVY LIFTING: Holding Time Calculation
  // Calculates days between open and close (or 'today' if still open)
  const holdingDays = useMemo(() => {
    if (!openDate) return null;
    const endDate = closedDate || new Date();
    
    // FIX: Use 'differenceInCalendarDays' to count date changes instead of 24h periods
    // This ensures 21st -> 23rd counts as 2 days regardless of the time.
    return Math.max(0, differenceInCalendarDays(endDate, openDate));
  }, [openDate, closedDate]);

  useEffect(() => {
    if (!isOpenPosition) return;
    
    let isMounted = true;

    const fetchPrice = async () => {
      try {
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
        setCurrentPrice(null);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [position.asset, isOpenPosition]);

  const unrealizedPnL = useMemo(() => {
    if (!isOpenPosition) return 0;
    if (currentPrice === null) return null;

    const entryPrice = position.entryPrice;
    const size = position.size;
    const exchangeRate = position.exchangeRate;

    const pnl = (currentPrice - entryPrice) * size * exchangeRate;
    return position.side === 'SHORT' ? -pnl : pnl;
  }, [currentPrice, position.entryPrice, position.size, position.exchangeRate, position.side, isOpenPosition]);

  const displayRealized = isClosed ? (position.realizedPnlEur || 0) : taxData.realizedPnlEur;
  const displayFee = isClosed ? (position.feeEur || 0) : taxData.feeTotalEur;

  return (
    <TableRow className={cn(!isOpenPosition && "opacity-75")}>
      <TableCell className="font-medium">{position.asset?.toUpperCase() || position.ticker || '—'}</TableCell>
      
      <TableCell className="text-right">
        {position.side ? (
          <Badge variant="outline" className={position.side === 'LONG' ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30"}>
            {position.side}
          </Badge>
        ) : '—'}
      </TableCell>

      {/* Chronological Group */}
      <TableCell className="text-right whitespace-nowrap text-muted-foreground font-mono text-[11px]">
        {openDate ? format(openDate, 'dd.MM.yy') : '—'}
      </TableCell>

      <TableCell className="text-right whitespace-nowrap text-muted-foreground font-mono text-[11px]">
        {closedDate ? format(closedDate, 'dd.MM.yy') : '—'}
      </TableCell>

      <TableCell className="text-right text-muted-foreground font-mono text-[11px]">
        {holdingDays !== null ? `${holdingDays} d` : '—'}
      </TableCell>

      <TableCell className="text-right font-mono">{position.size?.toFixed(4) || '—'}</TableCell>

      {/* ENTRY PRICE (Dynamic Decimals) */}
      <TableCell className="text-right">
        <div className="flex flex-col items-end">
          <span className="font-semibold">{formatEuroPrice(entryPriceEur)}</span>
          <span className="text-[10px] text-muted-foreground">{formatUsdPrice(position.entryPrice)}</span>
        </div>
      </TableCell>

      {/* EXIT PRICE (Dynamic Decimals) */}
      <TableCell className="text-right">
        {isClosed && position.exitPrice ? (
          <div className="flex flex-col items-end">
            <span className="font-medium text-muted-foreground">{formatEuroPrice(exitPriceEur)}</span>
            <span className="text-[10px] text-muted-foreground">{formatUsdPrice(position.exitPrice)}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="text-right text-muted-foreground">{notionalValueEur > 0 ? formatEuro(notionalValueEur) : '—'}</TableCell>

      <TableCell className={cn("text-right font-mono", displayRealized < 0 ? "text-red-500" : "text-emerald-500")}>
        {isOpenPosition ? "—" : formatEuro(displayRealized)}
      </TableCell>

      <TableCell className={cn("text-right font-mono", !isOpenPosition ? "text-muted-foreground" : (unrealizedPnL ?? 0) < 0 ? "text-red-500" : "text-emerald-500")}>
        {!isOpenPosition ? "—" : unrealizedPnL === null ? "—" : formatEuro(unrealizedPnL)}
      </TableCell>

      <TableCell className="text-right text-muted-foreground font-mono">
        {isOpenPosition ? "—" : displayFee > 0 ? formatEuro(displayFee) : '—'}
      </TableCell>

      <TableCell className="text-right">
        <Badge 
          variant={position.status === 'OPEN' ? 'default' : 'secondary'}
          className={cn(
            "text-[10px] uppercase",
            position.status === 'OPEN' && "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
          )}
        >
          {position.status}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
