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

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const cmpNullsLast = (a: number | null, b: number | null) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
};

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
    // ------- AGGREGATED -------
    const agg = aggregateBySymbol(investments, transactionsMap, yearFilter).rows.map(r => {
      const avgBuyPrice = r.buyQty > 0 ? r.costBasis / r.buyQty : 0;

      // derive a "latest activity" timestamp for sorting by date
      // group underlying investments by ticker/name to find their tx dates
      const relatedInvs = investments.filter(iv => (iv.ticker ?? iv.name) === (r.ticker ?? r.name));
      let latestActivityAt: number | null = null;
      for (const inv of relatedInvs) {
        const txs = transactionsMap[inv.id] ?? [];
        for (const t of txs) {
          const ts = t.date ? new Date(t.date).getTime() : NaN;
          if (Number.isFinite(ts)) latestActivityAt = Math.max(latestActivityAt ?? ts, ts);
        }
        // fallback to purchaseDate if no tx present
        if (!latestActivityAt && inv.purchaseDate) {
          const ts = new Date(inv.purchaseDate).getTime();
          if (Number.isFinite(ts)) latestActivityAt = ts;
        }
      }

      // ensure raw numeric fields exist for sorting
      const marketValue = num(r.marketValue);
      const performancePct = num(r.performancePct);
      const economicValue = num(r.economicValue ?? (r.marketValue + r.realizedPL));

      return {
        ...r,
        avgBuyPrice,
        latestActivityAt,
        _sort_marketValue: marketValue,
        _sort_performancePct: performancePct,
        _sort_economicValue: economicValue,
      };
    });

    // ------- FLAT -------
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

    // compute % of portfolio using economic value (works for both lists)
    const list = mode === 'flat' ? flat : agg;
    const econTotal = list.reduce(
      (s, r: any) => s + (num(r.economicValue ?? (r.marketValue + r.realizedPL)) ?? 0),
      0
    );
    list.forEach((r: any) => {
      const ev = num(r.economicValue ?? (r.marketValue + r.realizedPL)) ?? 0;
      r.percentPortfolio = econTotal > 0 ? ev / econTotal : 0;
    });

    // ------- SORTING -------
    if (mode === 'aggregated') {
      // map dropdown to fields
      switch (sortKey) {
        case 'performance':
          agg.sort((a, b) => cmpNullsLast(b._sort_performancePct, a._sort_performancePct)); // desc
          break;
        case 'totalAmount':
          agg.sort((a, b) => cmpNullsLast(b._sort_marketValue ?? b._sort_economicValue,
                                          a._sort_marketValue ?? a._sort_economicValue)); // desc
          break;
        case 'purchaseDate': // "Sort by Date"
        default:
          agg.sort((a, b) => cmpNullsLast(b.latestActivityAt, a.latestActivityAt)); // most recent first
          break;
      }
    } else {
      // your existing flat sorting block (unchanged)
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
  }, [investments, transactionsMap, yearFilter, mode, sortKey]);


  const rows: any[] = mode === 'flat' ? rowsFlat : rowsAgg;

  if (rows.length === 0) {
    return <div className="text-center text-muted-foreground py-12">No matching assets for this view.</div>;
  }

  // ===== Column visibility rules =====
  const isFlat = mode === 'flat';
  const isSoldView = isFlat && statusFilter === 'Sold';
  const isActiveView = isFlat && statusFilter === 'Active';

  const showPercentPortfolioCol = !isFlat;
  const showStatusCol = isFlat && statusFilter === 'All';
  const showPurchaseDateCol = isFlat;

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
            {isFlat ? (
              <>
                {showPurchaseDateCol && <th>Purchase Date</th>}
                {showStatusCol && <th>Status</th>}
                {showBoughtCol && <th className="text-right">Bought</th>}
                {showSoldCols && <th className="text-right">Sold</th>}
                {showAvailCol && <th className="text-right">Qty (avail.)</th>}
                {showBuyPrice && <th className="text-right">Buy Price</th>}
                {showSoldCols && <th className="text-right">Avg. Sell Price</th>}
                {showCurrentPriceCol && <th className="text-right">Current Price</th>}
              </>
            ) : (
                <>
                  <th className="text-right">Quantity</th>
                  <th className="text-right">Avg. Buy Price</th>
                </>
            )}
            
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

                {isFlat ? (
                  <>
                    {showPurchaseDateCol && <td className="text-muted-foreground">
                      {r.purchaseDate ? format(parseISO(r.purchaseDate), 'dd MMM yyyy') : '—'}
                    </td>}
                    {showStatusCol && <td className="text-muted-foreground">{r.status}</td>}

                    {showBoughtCol && <td className="text-right">{fmtQty(r.boughtQty)}</td>}
                    {showSoldCols && <td className="text-right">{isSoldRow ? fmtQty(r.soldQty) : '—'}</td>}
                    {showAvailCol && <td className="text-right">{fmtQty(r.availableQty)}</td>}

                    {showBuyPrice && <td className="text-right">{fmtEur.format(r.buyPrice)}</td>}
                    {showSoldCols && <td className="text-right">
                      {isSoldRow && r.avgSellPrice != null ? fmtEur.format(r.avgSellPrice) : '—'}
                    </td>}
                    {showCurrentPriceCol && <td className="text-right">{fmtEur.format(r.currentPrice)}</td>}
                  </>
                ) : (
                    <>
                       <td className="text-right">{fmtQty(r.availableQty)}</td>
                       <td className="text-right">{fmtEur.format(r.avgBuyPrice)}</td>
                    </>
                )}


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
