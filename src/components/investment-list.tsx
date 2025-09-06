'use client';

import React, { useMemo } from 'react';
import type {
  Investment,
  Transaction,
  YearFilter,
  SortKey,
  InvestmentStatus,
} from '@/lib/types';
import { aggregateBySymbol, calculatePositionMetrics } from '@/lib/portfolio';
import { format, parseISO } from 'date-fns';
import { History, PlusCircle } from 'lucide-react';

const fmtEur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtQty = (v: number, d = 6) => v.toFixed(d);
const fmtPct = (v: number) => `${(v * 100).toFixed(2)} %`;
const plClass = (v: number) =>
  v > 1e-6 ? 'text-emerald-500' : v < -1e-6 ? 'text-red-500' : 'text-foreground';

type Props = {
  investments: Investment[];
  transactionsMap: Record<string, Transaction[]>;
  yearFilter: YearFilter;
  showTypeColumn?: boolean;
  mode?: 'aggregated' | 'flat';
  sortKey?: SortKey;
  statusFilter?: InvestmentStatus | 'All';
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
  statusFilter = 'All',
  onViewHistory,
  onAddTransaction,
}: Props) {
  const { rowsAgg, rowsFlat } = useMemo(() => {
    const agg = aggregateBySymbol(investments, transactionsMap, yearFilter).rows;

    const flat = investments.map((inv) => {
      const m = calculatePositionMetrics(inv, transactionsMap[inv.id] ?? [], yearFilter);
      const txs = transactionsMap[inv.id] ?? [];
      const sells = txs.filter((t) => t.type === 'Sell');
      const soldQty = sells.reduce((s, t) => s + (Number(t.quantity) || 0), 0);
      const sellProceeds = sells.reduce((s, t) => s + (Number(t.totalAmount) || 0), 0);
      const avgSellPrice = soldQty > 0 ? sellProceeds / soldQty : null;

      return {
        key: inv.id,
        invId: inv.id,
        type: inv.type,
        status: inv.status,
        name: inv.name,
        ticker: inv.ticker ?? null,
        purchaseDate: inv.purchaseDate ?? null,

        boughtQty: Number(inv.purchaseQuantity) || 0,
        soldQty,
        availableQty: m.availableQty,
        buyPrice: Number(inv.purchasePricePerUnit) || 0,
        avgSellPrice,
        currentPrice: Number(inv.currentValue ?? 0),

        costBasis: m.availableQty * (Number(inv.purchasePricePerUnit) || 0),
        marketValue: m.marketValue,
        realizedPL: m.realizedPLDisplay,
        unrealizedPL: m.unrealizedPL,
        totalPL: m.totalPLDisplay,
        performancePct: m.performancePct,
        percentPortfolio: 0,
        economicValue: m.marketValue + m.realizedPLDisplay,
      };
    });

    // % of portfolio
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
      agg.sort((a, b) => b.economicValue - a.economicValue);
    } else {
      switch (sortKey) {
        case 'performance':
          flat.sort((a, b) => b.performancePct - a.performancePct);
          break;
        case 'totalAmount':
          flat.sort((a, b) => b.marketValue - a.marketValue);
          break;
        case 'purchaseDate':
        default:
          flat.sort((a, b) => {
            const ta = a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0;
            const tb = b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0;
            return tb - ta;
          });
          break;
      }
    }

    return { rowsAgg: agg, rowsFlat: flat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investments, transactionsMap, yearFilter, mode, sortKey]);

  const rows: any[] = mode === 'flat' ? rowsFlat : rowsAgg;
  if (rows.length === 0) {
    return <div className="text-center text-muted-foreground py-12">No matching assets for this view.</div>;
  }

  // ===== Column visibility rules (UPDATED) =====
  const isFlat = mode === 'flat';
  const isSoldView = isFlat && statusFilter === 'Sold';
  const isActiveView = isFlat && statusFilter === 'Active';

  const showPercentPortfolioCol = !isFlat;
  const showStatusCol = isFlat && statusFilter === 'All';
  const showPurchaseDateCol = isFlat;  // <-- always show in Flat

  const showBoughtCol = isFlat && !isSoldView;
  const showAvailCol  = isFlat && !isSoldView;
  const showSoldCols  = isFlat && statusFilter === 'Sold';
  const showBuyPrice  = !isSoldView;
  const showCurrentPriceCol = !isSoldView;
  const showCostBasisCol = !isSoldView;
  const showMarketValueCol = !isSoldView;

  const showRealizedPLCol   = !(isFlat && statusFilter === 'Active');
  const showUnrealizedPLCol = !(isSoldView || (isFlat && statusFilter === 'Active'));


  return (
    <div className="overflow-x-auto rounded-lg border bg-card/50">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:whitespace-nowrap text-left">
            {showTypeColumn && <th>Type</th>}
            <th>Asset</th>
            {showPurchaseDateCol && <th>Purchase Date</th>}
            {showStatusCol && <th>Status</th>}
            {showBoughtCol && <th className="text-right">Bought</th>}
            {showSoldCols && <th className="text-right">Sold</th>}
            {showAvailCol && <th className="text-right">Qty (avail.)</th>}
            {showBuyPrice && <th className="text-right">Buy Price</th>}
            {showSoldCols && <th className="text-right">Avg. Sell Price</th>}
            {showCurrentPriceCol && <th className="text-right">Current Price</th>}
            {showCostBasisCol && <th className="text-right">Cost Basis</th>}
            {showMarketValueCol && <th className="text-right">Market Value</th>}
            {showRealizedPLCol && <th className="text-right">Realized P/L</th>}
            {showUnrealizedPLCol && <th className="text-right">Unrealized P/L</th>}
            <th className="text-right">Total P/L</th>
            <th className="text-right">Performance</th>
            {showPercentPortfolioCol && <th className="text-right">% of Portfolio</th>}
            {isFlat && <th className="text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isSoldRow = r.status === 'Sold';
            return (
              <tr key={r.key} className="border-t last:border-b [&>td]:px-4 [&>td]:py-3">
                {showTypeColumn && <td className="font-medium">{r.type}</td>}
                <td className="font-medium">
                  {r.name}{r.ticker ? <span className="text-muted-foreground"> ({r.ticker})</span> : null}
                </td>

                {showPurchaseDateCol && (
                  <td className="text-muted-foreground">
                    {r.purchaseDate ? format(parseISO(r.purchaseDate), 'dd MMM yyyy') : '—'}
                  </td>
                )}

                {showStatusCol && <td className="text-muted-foreground">{r.status}</td>}

                {showBoughtCol && <td className="text-right">{fmtQty(r.boughtQty)}</td>}
                {showSoldCols && <td className="text-right">{isSoldRow ? fmtQty(r.soldQty) : '—'}</td>}
                {showAvailCol && <td className="text-right">{fmtQty(r.availableQty)}</td>}

                {showBuyPrice && <td className="text-right">{fmtEur.format(r.buyPrice)}</td>}
                {showSoldCols && (
                  <td className="text-right">
                    {isSoldRow && r.avgSellPrice != null ? fmtEur.format(r.avgSellPrice) : '—'}
                  </td>
                )}
                {showCurrentPriceCol && <td className="text-right">{fmtEur.format(r.currentPrice)}</td>}

                {showCostBasisCol && <td className="text-right">{fmtEur.format(r.costBasis)}</td>}
                {showMarketValueCol && <td className="text-right">{fmtEur.format(r.marketValue)}</td>}

                {showRealizedPLCol && (
                  <td className={`text-right ${plClass(r.realizedPL)}`}>{fmtEur.format(r.realizedPL)}</td>
                )}
                {showUnrealizedPLCol && (
                  <td className={`text-right ${plClass(r.unrealizedPL)}`}>{fmtEur.format(r.unrealizedPL)}</td>
                )}
                <td className={`text-right ${plClass(r.totalPL)}`}>{fmtEur.format(r.totalPL)}</td>

                <td className={`text-right ${plClass(r.performancePct)}`}>{fmtPct(r.performancePct)}</td>
                {showPercentPortfolioCol && <td className="text-right">{fmtPct(r.percentPortfolio ?? 0)}</td>}

                {isFlat && (
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
