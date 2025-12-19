// components/futures-positions-table.tsx
"use client";

import { useState, useTransition } from "react";
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
};

export default function FuturesPositionsTable({ positions, useMockData = true, userId }: Props) {
  const { user } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const enabledHook = !positions;
  const { positions: hookPositions, loading, error } = useFuturesPositions({
    userId: userId ?? user?.uid,
    useMockData,
  });

  const rows: FuturePosition[] = positions ?? hookPositions;
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
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">Notional Value (EUR)</TableHead>
              <TableHead className="text-right">Realized P&L</TableHead>
              <TableHead className="text-right">Funding (Net)</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center">No positions found. Sync with Kraken to populate.</TableCell></TableRow>
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
  
  // HEAVY LIFTING: Dynamic Currency Conversion
  const exchangeRate = position.exchangeRate || 0.85332;
  const entryPriceEur = position.entryPriceEur || (position.entryPrice * exchangeRate);
  const notionalValueEur = position.collateral || (position.size * entryPriceEur);
  
  // German number formatting
  const formatEuro = (val: number) => 
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);
  
  return (
    <TableRow>
      <TableCell className="font-medium">{position.asset}</TableCell>
      <TableCell className="text-right">
        <Badge variant="outline" className={position.side === 'LONG' ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30"}>
          {position.side}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <span className="font-semibold text-primary block">
          {formatEuro(entryPriceEur)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          ({position.entryPrice?.toLocaleString('en-US') || 0} USD @ {exchangeRate.toFixed(5)})
        </span>
      </TableCell>
      <TableCell className="text-right">{formatEuro(notionalValueEur)}</TableCell>
      <TableCell className={cn("text-right font-mono", taxData.realizedPnlEur < 0 ? "text-red-500" : "text-emerald-500")}>
        {formatEuro(taxData.realizedPnlEur)}
        {taxData.count > 0 && (
          <span className="block text-[10px] text-muted-foreground">
            ({taxData.count} entries)
          </span>
        )}
      </TableCell>
      <TableCell className={cn("text-right font-mono", taxData.fundingNetEur < 0 ? "text-red-500" : "text-emerald-500")}>
        {formatEuro(taxData.fundingNetEur)}
        {taxData.count > 0 && (
          <span className="block text-[10px] text-muted-foreground">
            ({taxData.count} entries)
          </span>
        )}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">{position.status}</TableCell>
    </TableRow>
  );
}
