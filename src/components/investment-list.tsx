
'use client';

import React, { useMemo } from 'react';
import type { Investment, Transaction, YearFilter } from '@/lib/types';
import { aggregateBySymbol, calculatePositionMetrics } from '@/lib/portfolio';

const fmtEur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtPct = (v: number) => `${(v * 100).toFixed(2)} %`;

type Props = {
  /** Investments already filtered by type/status on the page */
  investments: Investment[];
  transactionsMap: Record<string, Transaction[]>;
  yearFilter: YearFilter;

  /** Show the Type column when viewing “All Types” */
  showTypeColumn?: boolean;

  /** "aggregated" (by symbol) or "flat" (one row per investment) */
  mode?: 'aggregated' | 'flat';
};

export default function InvestmentListView({
  investments,
  transactionsMap,
  yearFilter,
  showTypeColumn = false,
  mode = 'aggregated',
}: Props) {
  const { rowsAgg, rowsFlat } = useMemo(() => {
    // Aggregated rows (by symbol)
    const agg = aggregateBySymbol(investments, transactionsMap, yearFilter).rows;

    // Flat rows (one row per investment)
    const flat = investments.map(inv => {
      const m = calculatePositionMetrics(inv, transactionsMap[inv.id] ?? [], yearFilter);
      const costBasis = m.availableQty * m.buyPrice;
      const economicValue = m.marketValue + m.realizedPLDisplay;

      return {
        key: inv.id,
        type: inv.type,
        name: inv.name,
        ticker: inv.ticker ?? null,
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

    // Compute % of portfolio within the chosen set.
    const econTotal =
      (mode === 'flat' ? flat : agg).reduce((s, r) => s + (r.marketValue + r.realizedPL), 0);

    (mode === 'flat' ? flat : agg).forEach(r => {
      const ev = r.marketValue + r.realizedPL;
      (r as any).percentPortfolio = econTotal > 0 ? ev / econTotal : 0;
    });

    // Sort both by economic value desc for a consistent view
    agg.sort((a, b) => b.economicValue - a.economicValue);
    flat.sort((a, b) => (b.marketValue + b.realizedPL) - (a.marketValue + a.realizedPL));

    return { rowsAgg: agg, rowsFlat: flat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investments, transactionsMap, yearFilter, mode]);

  const rows = mode === 'flat' ? rowsFlat : rowsAgg;

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
            <th className="text-right">Positions</th>
            <th className="text-right">Qty (avail.)</th>
            <th className="text-right">Cost Basis</th>
            <th className="text-right">Market Value</th>
            <th className="text-right">Realized P/L</th>
            <th className="text-right">Unrealized P/L</th>
            <th className="text-right">Total P/L</th>
            <th className="text-right">Performance</th>
            <th className="text-right">% of Portfolio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t last:border-b [&>td]:px-4 [&>td]:py-3">
              {showTypeColumn && <td className="font-medium">{r.type}</td>}
              <td className="font-medium">
                {r.name}{r.ticker ? <span className="text-muted-foreground"> ({r.ticker})</span> : null}
              </td>
              <td className="text-right">{r.positions}</td>
              <td className="text-right">{r.availableQty.toFixed(6)}</td>
              <td className="text-right">{fmtEur.format(r.costBasis)}</td>
              <td className="text-right">{fmtEur.format(r.marketValue)}</td>
              <td className={`text-right ${r.realizedPL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {fmtEur.format(r.realizedPL)}
              </td>
              <td className={`text-right ${r.unrealizedPL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {fmtEur.format(r.unrealizedPL)}
              </td>
              <td className={`text-right ${r.totalPL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {fmtEur.format(r.totalPL)}
              </td>
              <td className="text-right">{fmtPct(r.performancePct)}</td>
              <td className="text-right">{fmtPct(r.percentPortfolio ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
