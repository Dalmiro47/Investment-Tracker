// components/futures-positions-table.tsx
"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import type { FuturePosition } from "@/lib/types";
import { groupPositionsByClosingOrder } from "@/lib/futures-grouping";
import { useFuturesPositions } from "@/hooks/useFuturesPositions";
import { useClosedPositions } from "@/hooks/useClosedPositions";
import { useKrakenTaxData } from "@/hooks/useKrakenTaxData";
import { syncKrakenFutures } from "@/app/actions/kraken-sync";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
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
  userId?: string | null;
  statusFilter?: 'All' | 'OPEN' | 'CLOSED' | 'LIQUIDATED';
};

export default function FuturesPositionsTable({ positions, userId, statusFilter = 'All' }: Props) {
  const { user } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const enabledHook = !positions;
  const { positions: hookPositions, loading, error } = useFuturesPositions({
    userId: userId ?? user?.uid,
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

    const allPositions = Object.values(groups);
    
    // HYBRID ARCHITECTURE: Group CLOSED positions by closingOrderId for display
    // (Firestore still stores granular trades for audit trail)
    const groupedClosed = groupPositionsByClosingOrder(
      allPositions.filter(p => p.status === 'CLOSED')
    );
    
    // Combine grouped closed positions with open positions
    const openPositions = allPositions.filter(p => p.status === 'OPEN');
    return [...openPositions, ...groupedClosed];
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
        {/* Increased min-width to accommodate new Funding column */}
        <Table className="min-w-[1450px] text-sm">
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
              <TableHead className="text-right">Funding</TableHead>
              <TableHead className="text-right">
                Net P&L <span className="text-[10px] font-normal text-muted-foreground">(Tax Base)</span>
              </TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={15} className="h-24 text-center">No positions found. Sync with Kraken to populate.</TableCell></TableRow>
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
              <p className="text-muted-foreground">Trading fees paid (Open + Close).</p>
            </div>
            <div>
              <h4 className="font-semibold">Funding (Perpetuals)</h4>
              <p className="text-muted-foreground">
                 Funding payments are the cost of holding a position. 
                 <br/>• <span className="text-green-600 font-semibold">Positive</span> = Income (You received funding).
                 <br/>• <span className="text-red-600 font-semibold">Negative</span> = Cost (You paid funding).
                 <br/>These are summed up and included in the Net P&L calculation.
              </p>
            </div>
            <div>
              <h4 className="font-semibold">Net P&L (Tax Base)</h4>
              <p className="text-muted-foreground">The final taxable amount.<br/>
              <code className="text-xs">Formula: Gross P&L - Fees + Funding (Income/Cost)</code>
              </p>
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
    let retryCount = 0;
    const MAX_RETRIES = 3;

    const fetchPrice = async () => {
      try {
        if (!position.asset) {
          setCurrentPrice(null);
          return;
        }
        
        const cleanAsset = position.asset.split('/')[0].split(' ')[0].split('-')[0].toUpperCase();
        const response = await fetch(`/api/kraken/prices?asset=${cleanAsset}`, {
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        if (!response.ok) {
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            return; // Skip error logging on retries
          }
          throw new Error(`Failed to fetch price: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Invalid response format');
        }

        const data = await response.json();
        if (isMounted) {
          setCurrentPrice(parseFloat(data.price));
          retryCount = 0; // Reset on success
        }
      } catch (error) {
        // Only log errors after retries exhausted
        if (retryCount >= MAX_RETRIES && isMounted) {
          console.warn(`Unable to fetch price for ${position.asset}`);
        }
        if (isMounted) {
          setCurrentPrice(null);
        }
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

    // Standard PnL calc
    const diff = position.side === 'SHORT' 
      ? (entryPrice! - currentPrice) 
      : (currentPrice - entryPrice!);
      
    return diff * size! * exchangeRate;
  }, [currentPrice, position.entryPrice, position.size, position.exchangeRate, position.side, isOpenPosition]);

  // 1. Define what to display
  const displayRealized = isClosed ? (position.realizedPnlEur || 0) : taxData.realizedPnlEur;
  const displayFee = isClosed ? (position.feeEur || 0) : taxData.feeTotalEur;
  
  // Funding logic: For OPEN positions, use position.fundingEur; for CLOSED, use the same
  const displayFunding = isOpenPosition 
    ? (position.fundingEur ?? 0)  // For OPEN: directly from DB
    : (position.fundingEur || 0); // For CLOSED: existing logic

  // 2. Define Net P&L (Tax Base) logic
  // User Requirement: Keep empty for OPEN positions
  const netRealized = isClosed 
    ? (position.netRealizedPnlEur ?? (displayRealized - displayFee + displayFunding))
    : 0;

  // Fee tooltip calculation
  const feePercentage = displayRealized !== 0 ? ((displayFee / Math.abs(displayRealized)) * 100).toFixed(1) : 0;
  const feeTooltip = displayRealized > 0 
    ? `${feePercentage}% of profit`
    : displayRealized < 0
    ? "Added to loss"
    : "No impact";

  return (
    <TableRow className={cn(!isOpenPosition && "opacity-75")}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <span>{position.asset?.toUpperCase() || position.ticker || '—'}</span>
          {/* Show grouping badge when multiple trades are aggregated */}
          {(position as any).tradeCount && (position as any).tradeCount > 1 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30"
                  >
                    {(position as any).tradeCount}x
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold">Grouped Position</p>
                    <p>This position was closed with {(position as any).tradeCount} trades from a single closing order.</p>
                    <p className="text-muted-foreground mt-2">
                      Database stores each trade separately for audit trail, but the UI groups them by closing order for clarity.
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </TableCell>
      
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

      {/* REALIZED P&L: Hide if Open */}
      <TableCell className={cn("text-right font-mono", displayRealized < 0 ? "text-red-500" : "text-emerald-500")}>
        {isOpenPosition ? "—" : formatEuro(displayRealized)}
      </TableCell>

      {/* UNREALIZED P&L: Show if Open (Existing logic is good) */}
      <TableCell className={cn("text-right font-mono", !isOpenPosition ? "text-muted-foreground" : (unrealizedPnL ?? 0) < 0 ? "text-red-500" : "text-emerald-500")}>
        {!isOpenPosition ? "—" : unrealizedPnL === null ? "—" : formatEuro(unrealizedPnL)}
      </TableCell>

      {/* FEE: Hide if Open */}
      <TableCell className="text-right text-muted-foreground font-mono">
        {isOpenPosition ? "—" : displayFee > 0 ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help underline decoration-dotted">{formatEuro(displayFee)}</span>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{feeTooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : '—'}
      </TableCell>

      {/* FUNDING: Show for BOTH (Open & Closed) */}
      <TableCell className={cn("text-right font-mono font-semibold", displayFunding > 0 ? "text-emerald-500" : displayFunding < 0 ? "text-red-500" : "text-muted-foreground")}>
        {/* For OPEN positions: always show if fundingEur exists in DB, even if small */}
        {/* For CLOSED positions: show if non-zero */}
        {isOpenPosition 
          ? (position.fundingEur !== undefined && position.fundingEur !== null ? formatEuro(displayFunding) : '—')
          : (displayFunding !== 0 ? formatEuro(displayFunding) : '—')
        }
      </TableCell>

      {/* NET P&L: Hide if Open */}
      <TableCell className={cn("text-right font-mono font-bold", netRealized < 0 ? "text-red-500" : "text-emerald-500")}>
        {isOpenPosition ? "—" : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help underline decoration-dotted">{formatEuro(netRealized)}</span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1 text-xs">
                  <div>Gross P&L: <span className="font-semibold">{formatEuro(displayRealized)}</span></div>
                  <div>Fees: <span className="font-semibold">−{formatEuro(displayFee)}</span></div>
                  <div>Funding: <span className={cn("font-semibold", displayFunding >= 0 ? "text-emerald-400" : "text-red-400")}>{displayFunding >= 0 ? '+' : ''}{formatEuro(displayFunding)}</span></div>
                  <div className="border-t border-slate-400 pt-1 mt-1">Net Total: <span className="font-semibold">{formatEuro(netRealized)}</span></div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
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
