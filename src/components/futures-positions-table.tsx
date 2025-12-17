"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import type { FuturePosition } from "@/lib/types";
import { useFuturesPositions } from "@/hooks/useFuturesPositions";
import { syncKrakenFutures } from "@/app/actions/kraken-sync";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/money";
import { useAuth } from "@/hooks/use-auth";

type Props = {
  /** When provided, the table will not call the hook and will just render this data. */
  positions?: FuturePosition[];
  /** Use mock data instead of Firestore; falls back to true when no user id yet. */
  useMockData?: boolean;
  /** Optional user id for future Firestore integration. */
  userId?: string | null;
};

export default function FuturesPositionsTable({
  positions,
  useMockData = true,
  userId,
}: Props) {
  const { user } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const enabledHook = !positions;
  const {
    positions: hookPositions,
    loading,
    error,
  } = useFuturesPositions({
    userId: userId ?? user?.uid,
    useMockData,
  });

  const rows: FuturePosition[] = positions ?? hookPositions;

  const handleSync = () => {
    if (!user) {
      setErrorMsg("You must be signed in to sync Kraken futures.");
      return;
    }

    // For now, read key/secret from env; later you can surface a dialog to collect them.
    const apiKey = process.env.NEXT_PUBLIC_KRAKEN_FUTURES_KEY ?? "";
    const apiSecret = process.env.NEXT_PUBLIC_KRAKEN_FUTURES_SECRET ?? "";

    startTransition(async () => {
      try {
        const res = await syncKrakenFutures(user.uid, apiKey, apiSecret);
        if (!res.ok) {
          setErrorMsg(res.message);
        } else {
          setErrorMsg(null);
        }
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to sync Kraken futures.");
      }
    });
  };

  const showEmpty = !loading && rows.length === 0;

  return (
    <div className="mt-2 rounded-md border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-3 flex-wrap">
        <div className="flex flex-col">
          <span className="font-semibold">Kraken Futures Positions</span>
          <span className="text-xs text-muted-foreground">
            Aggregated by instrument with funding fees rolled into each row.
          </span>
        </div>
        <div className="flex items-center gap-2">
          {errorMsg && (
            <span className="text-xs text-destructive max-w-xs truncate">
              {errorMsg}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={handleSync} disabled={isPending}>
            {isPending ? "Syncing…" : "Sync Kraken"}
          </Button>
        </div>
      </div>
      {enabledHook && loading ? (
        <div className="p-4 text-sm text-muted-foreground">Loading futures positions…</div>
      ) : showEmpty ? (
        <div className="p-4 text-sm text-muted-foreground">No futures positions yet.</div>
      ) : error && enabledHook ? (
        <div className="p-4 text-sm text-destructive">
          Failed to load futures positions: {error.message}
        </div>
      ) : (
        <div className="overflow-x-auto">
      <Table className="min-w-[900px] text-sm">
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead className="text-right">Leverage</TableHead>
            <TableHead className="text-right">Entry</TableHead>
            <TableHead className="text-right">Mark</TableHead>
            <TableHead className="text-right hidden sm:table-cell">
              Liq. Price
            </TableHead>
            <TableHead className="text-right hidden md:table-cell">
              Collateral
            </TableHead>
            <TableHead className="text-right hidden md:table-cell">
              Notional Size
            </TableHead>
            <TableHead className="text-right hidden sm:table-cell">
              Funding
            </TableHead>
            <TableHead className="text-right">Unrealized P/L</TableHead>
            <TableHead className="text-right hidden lg:table-cell">
              Opened
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((pos) => {
            const isLong = pos.side === "LONG";
            const pnl = pos.unrealizedPnL ?? 0;
            const pnlColor =
              pnl > 0 ? "text-emerald-500" : pnl < 0 ? "text-red-500" : "text-foreground";

            return (
              <TableRow key={pos.id}>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <div className="font-medium">{pos.asset}</div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px] px-1.5 py-0.5",
                        isLong
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                          : "border-red-500/40 bg-red-500/10 text-red-400"
                      )}
                    >
                      {pos.side}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {pos.leverage.toFixed(1).replace(/\.0$/, "")}x
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(pos.entryPrice)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(pos.markPrice)}
                </TableCell>
                <TableCell className="text-right font-mono hidden sm:table-cell">
                  {formatCurrency(pos.liquidationPrice)}
                </TableCell>
                <TableCell className="text-right font-mono hidden md:table-cell">
                  {formatCurrency(pos.collateral)}
                </TableCell>
                <TableCell className="text-right font-mono hidden md:table-cell">
                  {formatCurrency(pos.size)}
                </TableCell>
                <TableCell className="text-right font-mono hidden sm:table-cell">
                  {formatCurrency(pos.accumulatedFunding)}
                </TableCell>
                <TableCell className={cn("text-right font-mono", pnlColor)}>
                  {formatCurrency(pnl)}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground hidden lg:table-cell">
                  {pos.openedAt ? format(pos.openedAt.toDate(), "dd.MM.yyyy HH:mm") : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
        </div>
      )}
    </div>
  );
}


