
"use client";

import React, { useMemo } from 'react';
import type {
  Investment,
  Transaction,
  YearFilter,
  SortKey,
  InvestmentStatus,
  InvestmentType,
} from '@/lib/types';
import { aggregateBySymbol, calculatePositionMetrics } from '@/lib/portfolio';
import { format, parseISO } from 'date-fns';
import { History, PlusCircle } from 'lucide-react';
import type { SavingsRateChange } from '@/lib/types-savings';
import { EtfSimLink } from '@/components/etf/EtfSimLink';
import EtfPlansButton from '@/components/etf/EtfPlansButton';

const fmtEur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtQty = (v: number, d = 6) => v.toFixed(d);
const fmtPct = (v: number) => `${(v * 100).toFixed(2)} %`;
const fmtRate = (v: number | null | undefined) =>
  v == null ? '—' : `${v.toFixed(2)} %`;

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

const todayISO = () => new Date().toISOString().slice(0, 10);
const getCurrentRate = (rates?: SavingsRateChange[]) => {
  if (!rates || rates.length === 0) return null;
  const t = todayISO();
  const eligible = rates.filter(r => r.from <= t).sort((a, b) => a.from.localeCompare(b.from));
  return eligible.length ? eligible[eligible.length - 1].annualRatePct : rates[0].annualRatePct;
};

type Props = {
  investments: Investment[];
  transactionsMap: Record<string, Transaction[]>;
  rateSchedulesMap?: Record<string, SavingsRateChange[]>;
  yearFilter: YearFilter;
  showTypeColumn?: boolean;
  mode?: 'aggregated' | 'flat';
  sortKey?: SortKey;
  statusFilter?: InvestmentStatus | 'All';
  activeTypeFilter?: InvestmentType | 'All';
  onViewHistory?: (investmentId: string) => void;
  onAddTransaction?: (investmentId: string) => void;
};

export default function InvestmentListView({
  investments,
  transactionsMap,
  rateSchedulesMap,
  yearFilter,
  showTypeColumn = false,
  mode = 'aggregated',
  sortKey,
  statusFilter = 'All',
  activeTypeFilter = 'All',
  onViewHistory,
  onAddTransaction,
}: Props) {
  const IA_MODE = activeTypeFilter === 'Interest Account';

  const { rowsAgg, rowsFlat } = useMemo(() => {
    // ------- AGGREGATED -------
    const agg = aggregateBySymbol(investments, transactionsMap, yearFilter).rows.map(r => {
      // match related investments by same aggregation key
      const aggKey = (iv: Investment) => `${iv.type}:${(iv.ticker || iv.name).toLowerCase()}`;
      const relatedInvs = investments.filter(iv => aggKey(iv) === r.key);

      // latest activity for sorting by date
      let latestActivityAt: number | null = null;
      for (const inv of relatedInvs) {
        const txs = transactionsMap[inv.id] ?? [];
        for (const t of txs) {
          const ts = t.date ? new Date(t.date).getTime() : NaN;
          if (Number.isFinite(ts)) latestActivityAt = Math.max(latestActivityAt ?? ts, ts);
        }
        if (!latestActivityAt && inv.purchaseDate) {
          const ts = new Date(inv.purchaseDate).getTime();
          if (Number.isFinite(ts)) latestActivityAt = ts;
        }
      }

      // current rate (for IA aggregated; assume one IA per row)
      let currentRatePct: number | null = null;
      if (relatedInvs.length > 0 && relatedInvs[0].type === 'Interest Account') {
        currentRatePct = getCurrentRate(rateSchedulesMap?.[relatedInvs[0].id]);
      }

      const marketValue = num(r.marketValue);
      const performancePct = num(r.performancePct);
      const economicValue = num(r.economicValue ?? (r.marketValue + r.realizedPL));

      return {
        ...r,
        // Alias buyQty to boughtQty for consistency with Flat view
        boughtQty: r.buyQty,
        currentRatePct,
        latestActivityAt,
        _sort_marketValue: marketValue,
        _sort_performancePct: performancePct,
        _sort_economicValue: economicValue,
      };
    });

    // ------- FLAT -------
    const flat = investments.map((inv) => {
      const m = calculatePositionMetrics(inv, transactionsMap[inv.id] ?? [], yearFilter, rateSchedulesMap?.[inv.id]);
      const txs = transactionsMap[inv.id] ?? [];
      const sells = txs.filter((t) => t.type === 'Sell');
      const soldQty = sells.reduce((s, t) => s + (Number(t.quantity) || 0), 0);
      const sellProceeds = sells.reduce((s, t) => s + (Number(t.totalAmount) || 0), 0);
      const avgSellPrice = soldQty > 0 ? sellProceeds / soldQty : null;

      const isIA = inv.type === 'Interest Account';
      const costBasis = isIA
        ? m.purchaseValue
        : m.availableQty * (Number(inv.purchasePricePerUnit) || 0);

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
        buyPrice: isIA ? 0 : (Number(inv.purchasePricePerUnit) || 0),
        avgSellPrice,
        currentPrice: isIA ? 0 : (Number(inv.currentValue ?? 0)),

        costBasis,
        marketValue: m.marketValue,             // IA: Balance
        realizedPL: m.realizedPLDisplay,
        unrealizedPL: m.unrealizedPL,           // IA: Accrued Interest
        totalPL: m.totalPLDisplay,
        performancePct: m.performancePct,
        purchaseValue: m.purchaseValue,
        percentPortfolio: 0,
        economicValue: m.marketValue + m.realizedPLDisplay,

        currentRatePct: isIA ? getCurrentRate(rateSchedulesMap?.[inv.id]) : null,
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
      switch (sortKey) {
        case 'performance': agg.sort((a, b) => cmpNullsLast(b._sort_performancePct, a._sort_performancePct)); break;
        case 'totalAmount': agg.sort((a, b) => cmpNullsLast(b._sort_marketValue ?? b._sort_economicValue, a._sort_marketValue ?? a._sort_economicValue)); break;
        case 'purchaseDate': default: agg.sort((a, b) => cmpNullsLast(b.latestActivityAt, a.latestActivityAt)); break;
      }
    } else {
      switch (sortKey) {
        case 'performance': flat.sort((a, b) => b.performancePct - a.performancePct); break;
        case 'totalAmount': flat.sort((a, b) => b.marketValue - a.marketValue); break;
        case 'purchaseDate': default: flat.sort((a, b) => {
          const ta = a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0;
          const tb = b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0;
          return tb - ta;
        }); break;
      }
    }

    return { rowsAgg: agg, rowsFlat: flat };
  }, [investments, transactionsMap, yearFilter, mode, sortKey, rateSchedulesMap]);

  const rows: any[] = mode === 'flat' ? rowsFlat : rowsAgg;

  const totals = useMemo(() => {
    if (rows.length === 0) return null;
    
    const acc = rows.reduce((a, r) => {
        a.costBasis += r.costBasis ?? 0;
        a.marketValue += r.marketValue ?? 0;
        a.realizedPL += r.realizedPL ?? 0;
        a.unrealizedPL += r.unrealizedPL ?? 0;
        a.totalPL += r.totalPL ?? 0;
        a.purchaseValue += r.purchaseValue ?? 0;
        a.boughtQty += r.boughtQty ?? 0;
        a.availableQty += r.availableQty ?? 0;
        return a;
    }, { costBasis: 0, marketValue: 0, realizedPL: 0, unrealizedPL: 0, totalPL: 0, purchaseValue: 0, boughtQty: 0, availableQty: 0 });

    return {
        ...acc,
        performancePct: acc.purchaseValue > 0 ? acc.totalPL / acc.purchaseValue : 0,
        percentPortfolio: acc.marketValue + acc.realizedPL > 0 ? 1 : 0,
    };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        <div>No matching assets for this view.</div>
        {activeTypeFilter === 'ETF' && (
          <div className="mt-3">
            <EtfPlansButton />
          </div>
        )}
      </div>
    );
  }

  // --- IA-specific rendering when filter is Interest Accounts ---
  if (IA_MODE) {
    const showPercentPortfolioCol = mode === 'aggregated';
    return (
      <div className="mt-2 rounded-md border bg-card">
        <div className="relative max-h-[70vh] overflow-auto scroll-area">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="sticky top-0 z-10 bg-background/95 text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/70 shadow-[0_1px_0_0_var(--border)]">
              <tr className="[&>th]:px-4 [&>th]:py-3 text-left">
                <th>Account</th>
                <th className="text-right">Current Rate</th>
                <th className="text-right">Net Deposits</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Accrued Interest</th>
                <th className="text-right">Performance</th>
                {showPercentPortfolioCol && <th className="text-right">% of Portfolio</th>}
                {mode === 'flat' && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border [&>tr>td]:px-2 [&>tr>td]:py-3">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-right">{fmtRate(r.currentRatePct)}</td>
                  <td className="text-right">{fmtEur.format(r.costBasis)}</td>
                  <td className="text-right">{fmtEur.format(r.marketValue)}</td>
                  <td className={`text-right ${plClass(r.unrealizedPL)}`}>{fmtEur.format(r.unrealizedPL)}</td>
                  <td className={`text-right ${plClass(r.performancePct)}`}>{fmtPct(r.performancePct)}</td>
                  {showPercentPortfolioCol && <td className="text-right">{fmtPct(r.percentPortfolio ?? 0)}</td>}
                  {mode === 'flat' && (
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button title="View History" className="px-2 py-1 rounded hover:bg-muted" onClick={() => onViewHistory?.(r.invId)}><History className="h-4 w-4" /></button>
                        <button title="Add Transaction" className="px-2 py-1 rounded hover:bg-muted" onClick={() => onAddTransaction?.(r.invId)}><PlusCircle className="h-4 w-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot className="sticky bottom-0 z-10 font-bold bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 shadow-[0_-1px_0_0_var(--border)]">
                <tr className="[&>td]:px-2 [&>td]:py-3">
                  <td>Total</td>
                  <td></td>
                  <td className="text-right">{fmtEur.format(totals.costBasis)}</td>
                  <td className="text-right">{fmtEur.format(totals.marketValue)}</td>
                  <td className={`text-right ${plClass(totals.unrealizedPL)}`}>{fmtEur.format(totals.unrealizedPL)}</td>
                  <td className={`text-right ${plClass(totals.performancePct)}`}>{fmtPct(totals.performancePct)}</td>
                  {showPercentPortfolioCol && <td className="text-right">{fmtPct(totals.percentPortfolio)}</td>}
                  {mode === 'flat' && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  }

  // ---- Default (generic) table for all other types ----
  const isFlat = mode === 'flat';
  const isAggregated = mode === 'aggregated';
  const isSoldView = isFlat && statusFilter === 'Sold';

  const showPercentPortfolioCol = !isFlat;
  const showStatusCol = isFlat && statusFilter === 'All';
  const showPurchaseDateCol = isFlat;

  const showBoughtCol = !isSoldView;
  const showAvailCol  = !isSoldView;
  const showSoldCols  = isFlat && statusFilter === 'Sold';
  const showBuyPrice  = !isSoldView;
  const showCurrentPriceCol = !isSoldView;
  const showCostBasisCol = !isSoldView;
  const showRealizedPLCol   = !(isFlat && statusFilter === 'Active');
  const showUnrealizedPLCol = !(isSoldView || (isFlat && statusFilter === 'Active'));

  return (
    <div className="mt-2 rounded-md border bg-card">
      <div className="relative max-h-[70vh] overflow-auto scroll-area">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="sticky top-0 z-10 bg-background/95 text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/70 shadow-[0_1px_0_0_var(--border)]">
            <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:whitespace-nowrap text-left">
              {showTypeColumn && <th>Type</th>}
              <th>Asset</th>
              {showPurchaseDateCol && <th>Purchase Date</th>}
              {showStatusCol && <th>Status</th>}
              
              {isFlat ? (
                <>
                  {showBoughtCol && <th className="text-right">Bought</th>}
                  {showSoldCols && <th className="text-right">Sold</th>}
                  {showAvailCol && <th className="text-right">Qty (avail.)</th>}
                  {showBuyPrice && <th className="text-right">Buy Price</th>}
                  {showSoldCols && <th className="text-right">Avg. Sell Price</th>}
                  {showCurrentPriceCol && <th className="text-right">Current Price</th>}
                  {showCostBasisCol && <th className="text-right">Cost Basis</th>}
                </>
              ) : isAggregated ? (
                <>
                  <th className="text-right">Bought</th>
                  <th className="text-right">Qty (avail.)</th>
                  <th className="text-right">Buy Price</th>
                  <th className="text-right">Current Price</th>
                  <th className="text-right">Cost Basis</th>
                </>
              ) : null
            }
            <th className="text-right">Market Value</th>
            {showRealizedPLCol && <th className="text-right">Realized P/L</th>}
            {showUnrealizedPLCol && <th className="text-right">Unrealized P/L</th>}
            <th className="text-right">Total P/L</th>
            <th className="text-right">Performance</th>
            {showPercentPortfolioCol && <th className="text-right">% of Portfolio</th>}
            {isFlat && <th className="text-right">Actions</th>}
          </tr>
          </thead>
          <tbody className="divide-y divide-border [&>tr>td]:px-2 [&>tr>td]:py-3">
          {rows.map((r) => {
            const isSoldRow = r.status === 'Sold';
            const isIARow = r.type === 'Interest Account';
            return (
              <tr key={r.key}>
                {showTypeColumn && <td className="font-medium">{r.type}</td>}
                <td className="font-medium">
                  <div className="flex items-center gap-2">
                    <div>
                      <div>{r.name}</div>
                      {r.ticker && <div className="text-xs text-muted-foreground">{r.ticker}</div>}
                    </div>
                    {r.type === 'ETF' && r.planId && (
                      <EtfSimLink
                        planId={r.planId}
                        symbol={r.ticker ?? undefined}
                        className="ml-1"
                        showSummary
                      />
                    )}
                  </div>
                </td>

                {showPurchaseDateCol && <td className="text-muted-foreground">{r.purchaseDate ? format(parseISO(r.purchaseDate), 'dd MMM yyyy') : '—'}</td>}
                {showStatusCol && <td className="text-muted-foreground">{r.status}</td>}

                { isFlat ? (
                    <>
                      {showBoughtCol && <td className="text-right">{isIARow ? '—' : fmtQty(r.boughtQty)}</td>}
                      {showSoldCols && <td className="text-right">{isIARow ? '—' : (isSoldRow ? fmtQty(r.soldQty) : '—')}</td>}
                      {showAvailCol && <td className="text-right">{isIARow ? '—' : fmtQty(r.availableQty)}</td>}
                      {showBuyPrice && <td className="text-right">{isIARow ? '—' : fmtEur.format(r.buyPrice)}</td>}
                      {showSoldCols && <td className="text-right">{isIARow ? '—' : (isSoldRow && r.avgSellPrice != null ? fmtEur.format(r.avgSellPrice) : '—')}</td>}
                      {showCurrentPriceCol && <td className="text-right">{isIARow ? '—' : fmtEur.format(r.currentPrice)}</td>}
                      {showCostBasisCol && <td className="text-right" title={isIARow ? "Net Deposits" : undefined}>{fmtEur.format(r.costBasis)}</td>}
                    </>
                ) : (
                    <>
                      <td className="text-right">{isIARow ? '—' : fmtQty(r.boughtQty)}</td>
                      <td className="text-right">{isIARow ? '—' : fmtQty(r.availableQty)}</td>
                      <td className="text-right">{r.availableQty > 0 ? fmtEur.format(r.buyPrice) : '—'}</td>
                      <td className="text-right">{r.availableQty > 0 ? fmtEur.format(r.currentPrice) : '—'}</td>
                      <td className="text-right">{fmtEur.format(r.costBasis)}</td>
                    </>
                )}

                <td className="text-right" title={isIARow ? "Balance" : undefined}>{fmtEur.format(r.marketValue)}</td>

                {showRealizedPLCol && <td className={`text-right ${plClass(r.realizedPL)}`}>{fmtEur.format(r.realizedPL)}</td>}
                {showUnrealizedPLCol && <td className={`text-right ${plClass(r.unrealizedPL)}`} title={isIARow ? "Accrued Interest" : undefined}>{fmtEur.format(r.unrealizedPL)}</td>}
                
                <td className={`text-right ${plClass(r.totalPL)}`}>{fmtEur.format(r.totalPL)}</td>
                <td className={`text-right ${plClass(r.performancePct)}`}>{fmtPct(r.performancePct)}</td>
                {showPercentPortfolioCol && <td className="text-right">{fmtPct(r.percentPortfolio ?? 0)}</td>}

                {isFlat && <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button title="View History" className="px-2 py-1 rounded hover:bg-muted" onClick={() => onViewHistory?.(r.invId)}><History className="h-4 w-4" /></button>
                      <button title="Add Transaction" className="px-2 py-1 rounded hover:bg-muted" onClick={() => onAddTransaction?.(r.invId)}><PlusCircle className="h-4 w-4" /></button>
                    </div>
                  </td>
                }
              </tr>
            );
          })}
          </tbody>
          {totals && (
            <tfoot className="sticky bottom-0 z-10 font-bold bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 shadow-[0_-1px_0_0_var(--border)]">
              <tr className="[&>td]:px-4 [&>td]:py-3 [&>td]:whitespace-nowrap">
                <td>Total</td>
                {showTypeColumn && <td></td>}
                {showPurchaseDateCol && <td></td>}
                {showStatusCol && <td></td>}
                
                {isFlat ? (
                    <>
                        {showBoughtCol && <td className="text-right">{fmtQty(totals.boughtQty)}</td>}
                        {showSoldCols && <td></td>}
                        {showAvailCol && <td className="text-right">{fmtQty(totals.availableQty)}</td>}
                        {showBuyPrice && <td></td>}
                        {showSoldCols && <td></td>}
                        {showCurrentPriceCol && <td></td>}
                        {showCostBasisCol && <td className="text-right">{fmtEur.format(totals.costBasis)}</td>}
                    </>
                ) : isAggregated ? (
                    <>
                        <td className="text-right">{fmtQty(totals.boughtQty)}</td>
                        <td className="text-right">{fmtQty(totals.availableQty)}</td>
                        <td></td>
                        <td></td>
                        <td className="text-right">{fmtEur.format(totals.costBasis)}</td>
                    </>
                ) : null}

                <td className="text-right">{fmtEur.format(totals.marketValue)}</td>
                {showRealizedPLCol && <td className={`text-right ${plClass(totals.realizedPL)}`}>{fmtEur.format(totals.realizedPL)}</td>}
                {showUnrealizedPLCol && <td className={`text-right ${plClass(totals.unrealizedPL)}`}>{fmtEur.format(totals.unrealizedPL)}</td>}
                <td className={`text-right ${plClass(totals.totalPL)}`}>{fmtEur.format(totals.totalPL)}</td>
                <td className={`text-right ${plClass(totals.performancePct)}`}>{fmtPct(totals.performancePct)}</td>
                {showPercentPortfolioCol && <td className="text-right">{fmtPct(totals.percentPortfolio)}</td>}
                {isFlat && <td></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
