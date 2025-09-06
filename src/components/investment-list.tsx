'use client';

import React, { useMemo } from 'react';
import type { Investment, Transaction, YearFilter, SortKey } from '@/lib/types';
import { aggregateBySymbol, calculatePositionMetrics } from '@/lib/portfolio';
import { format, parseISO } from 'date-fns';
import { History, PlusCircle } from 'lucide-react';

const fmtEur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtPct = (v: number) => `${(v * 100).toFixed(2)} %`;
const plClass = (v: number) =>
  v > 1e-6 ? 'text-emerald-500' : v < -1e-6 ? 'text-red-500' : 'text-foreground';

type Props = {
  /** Investments already filtered by type/status on the page */
  investments: Investment[];
  transactionsMap: Record<string, Transaction[]>;
  yearFilter: YearFilter;

  /** Show the Type column when viewing “All Types” */
  showTypeColumn?: boolean;

  /** "aggregated" (by symbol) or "flat" (one row per investment) */
  mode?: 'aggregated' | 'flat';

  /** sorting to apply in FLAT mode */
  sortKey?: SortKey;

  onViewHistory?: (investmentId: string) => void;
  onAddTransaction?: (investmentId: string) => void;
};

export default function InvestmentListView({
  investments,
  transactionsMap,
  yearFilter,
  showTypeColumn = false,
  mode = 'aggregated',
  sortKey,
  onViewHistory,
  onAddTransaction,
}: Props) {
  const { rowsAgg, rowsFlat } = useMemo(() => {
    // Aggregated rows (by symbol)
    const agg = aggregateBySymbol(investments, transactionsMap, yearFilter).rows;

    // Flat rows (one row per investment)
    const flat = investments.map((inv) => {
      const m = calculatePositionMetrics(inv, transactionsMap[inv.id] ?? [], yearFilter);
      const costBasis = m.availableQty * m.buyPrice;
      const economicValue = m.marketValue + m.realizedPLDisplay;

      return {
        key: inv.id,
        invId: inv.id,
        type: inv.type,
        name: inv.name,
        ticker: inv.ticker ?? null,
        purchaseDate: inv.purchaseDate ?? null,
        positions: 1,
        buyQty: m.buyQty,
        availableQty: m.availableQty,
        costBasis,
        marketValue: m.marketValue,
        realizedPL: m.realizedPLDisplay,
        unrealizedPL: m.unrealizedPL,
        totalPL: m.totalPLDisplay,
        performancePct: m.performancePct,
        percentPortfolio: 0, // computed below
        economicValue,
      };
    });

    // Compute % of portfolio within the currently displayed set
    const list = mode === 'flat' ? flat : agg;
    const econTotal = list.reduce(
      (s, r: any) => s + (r.economicValue ?? (r.marketValue + r.realizedPL)),
      0
    );
    list.forEach((r: any) => {
      const ev = r.economicValue ?? (r.marketValue + r.realizedPL);
      r.percentPortfolio = econTotal > 0 ? ev / econTotal : 0;
    });

    // Sorting
    if (mode === 'aggregated') {
      // consistent for aggregated
      agg.sort((a, b) => b.economicValue - a.economicValue);
    }
    // The `investments` prop is already sorted by the page-level component,
    // so `flat` will reflect that sort automatically. No re-sorting is needed here.

    return { rowsAgg: agg, rowsFlat: flat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investments, transactionsMap, yearFilter, mode, sortKey]);

  const rows: any[] = mode === 'flat' ? rowsFlat : rowsAgg;

  if (rows.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        No matching assets for this view.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card/50">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:whitespace-nowrap text-left">
            {showTypeColumn && <th>Type</th>}
            <th>Asset</th>
            {mode === 'flat' && <th>Purchase Date</th>}
            <th className="text-right">Positions</th>
            <th className="text-right">Qty (avail.)</th>
            <th className="text-right">Cost Basis</th>
            <th className="text-right">Market Value</th>
            <th className="text-right">Realized P/L</th>
            <th className="text-right">Unrealized P/L</th>
            <th className="text-right">Total P/L</th>
            <th className="text-right">Performance</th>
            <th className="text-right">% of Portfolio</th>
            {mode === 'flat' && <th className="text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t last:border-b [&>td]:px-4 [&>td]:py-3">
              {showTypeColumn && <td className="font-medium">{r.type}</td>}
              <td className="font-medium">
                {r.name}
                {r.ticker ? <span className="text-muted-foreground"> ({r.ticker})</span> : null}
              </td>

              {mode === 'flat' && (
                <td className="text-muted-foreground">
                  {r.purchaseDate ? format(parseISO(r.purchaseDate), 'dd MMM yyyy') : '—'}
                </td>
              )}

              <td className="text-right">{r.positions}</td>
              <td className="text-right">{r.availableQty.toFixed(6)}</td>
              <td className="text-right">{fmtEur.format(r.costBasis)}</td>
              <td className="text-right">{fmtEur.format(r.marketValue)}</td>

              <td className={`text-right ${plClass(r.realizedPL)}`}>{fmtEur.format(r.realizedPL)}</td>
              <td className={`text-right ${plClass(r.unrealizedPL)}`}>{fmtEur.format(r.unrealizedPL)}</td>
              <td className={`text-right ${plClass(r.totalPL)}`}>{fmtEur.format(r.totalPL)}</td>

              <td className={`text-right ${plClass(r.performancePct)}`}>{fmtPct(r.performancePct)}</td>
              <td className="text-right">{fmtPct(r.percentPortfolio ?? 0)}</td>

              {mode === 'flat' && (
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      title="View History"
                      className="px-2 py-1 rounded hover:bg-muted"
                      onClick={() => onViewHistory?.(r.invId)}
                    >
                      <History className="h-4 w-4" />
                    </button>
                    <button
                      title="Add Transaction"
                      className="px-2 py-1 rounded hover:bg-muted"
                      onClick={() => onAddTransaction?.(r.invId)}
                    >
                      <PlusCircle className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
