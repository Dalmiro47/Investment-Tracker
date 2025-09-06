
'use client';

import React from 'react';
import type { Investment, InvestmentStatus, InvestmentType, Transaction, YearFilter } from '@/lib/types';
import { aggregateBySymbol } from '@/lib/portfolio';

const fmtEur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtPct = (v: number) => `${(v * 100).toFixed(2)} %`;

type Props = {
  investments: Investment[]; // already filtered by type/status on the page
  transactionsMap: Record<string, Transaction[]>;
  yearFilter: YearFilter;
  showTypeColumn?: boolean; // show when type filter = "All"
};

export default function InvestmentListView({
  investments,
  transactionsMap,
  yearFilter,
  showTypeColumn = false,
}: Props) {
  const { rows } = aggregateBySymbol(investments, transactionsMap, yearFilter);

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
                {r.name}
                {r.ticker ? <span className="text-muted-foreground"> ({r.ticker})</span> : null}
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
