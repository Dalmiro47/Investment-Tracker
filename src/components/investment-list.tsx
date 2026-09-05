
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
import { Badge } from '@/components/ui/badge';
import type { SavingsRateChange } from '@/lib/types-savings';

const fmtEur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtQty = (v: number, d = 6) => v.toFixed(d);
const fmtPct = (v: number) => `${(v * 100).toFixed(2)} %`;
const fmtRate = (v: number | null | undefined) =>
  v == null ? '—' : `${v.toFixed(2)} %`;

const plClass = (v: number) =>
  v > 1e-6 ? 'gain' : v < -1e-6 ? 'loss' : 'text-foreground';

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

/* ── Presentation helpers (styling only) ───────────────────────────── */

const THEAD_CLASS =
  'sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 shadow-[0_1px_0_0_hsl(var(--border))]';
const TH_ROW_CLASS =
  'text-left [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-[11px] [&>th]:font-bold [&>th]:uppercase [&>th]:tracking-[.08em] [&>th]:text-muted-foreground';
const TBODY_CLASS =
  'divide-y divide-border [&>tr>td]:whitespace-nowrap [&>tr>td]:px-3 [&>tr>td]:py-3 [&>tr>td]:font-mono [&>tr>td]:text-[13px] [&>tr>td]:tabular-nums';
const TR_CLASS = 'transition-colors hover:bg-white/[.02]';
const TFOOT_CLASS =
  'sticky bottom-0 z-10 border-t border-input bg-background/95 font-bold backdrop-blur supports-[backdrop-filter]:bg-background/70';
const TFOOT_ROW_CLASS =
  '[&>td]:whitespace-nowrap [&>td]:bg-white/[.02] [&>td]:px-3 [&>td]:py-3 [&>td]:font-mono [&>td]:text-[13px] [&>td]:tabular-nums';

/** Glass shell with a header row (title + sub) wrapping a scrollable table. */
function TableShell({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass mt-2 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <div className="font-headline text-[16px] font-bold leading-tight tracking-tight">
            {title}
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">{sub}</div>
        </div>
      </div>
      <div className="relative max-h-[70vh] overflow-auto scroll-area">{children}</div>
    </div>
  );
}

/** Name + mono ticker, the shared "asset" cell. */
function AssetCell({ name, ticker }: { name: string; ticker?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col font-body font-semibold">
      <span className="truncate">{name}</span>
      {ticker && (
        <span className="truncate font-mono text-[11px] font-medium text-muted-foreground">
          {ticker}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={status === 'Active' ? 'success' : 'secondary'} className="font-body">
      {status}
    </Badge>
  );
}

function RowActions({
  onViewHistory,
  onAddTransaction,
}: {
  onViewHistory?: () => void;
  onAddTransaction?: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <button
        title="View History"
        className="grid h-8 w-8 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={onViewHistory}
      >
        <History className="h-4 w-4" />
      </button>
      <button
        title="Add Transaction"
        className="grid h-8 w-8 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={onAddTransaction}
      >
        <PlusCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Compact stat tile used inside the mobile cards. */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[10px] border border-border bg-black/[.28] px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-[.04em] text-muted-foreground">
        {label}
      </span>
      <span className="truncate font-mono text-[13px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}

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

      const isFullySold = r.availableQty < 1e-6;
      const displayBasis = isFullySold ? r.soldBasis : r.costBasis;

      // NEW: Calculate Sold Value (Proceeds)
      const soldValue = r.soldBasis + r.realizedPL;

      // NEW: Determine what to show in "Market Value" column
      // If fully sold, show the total exit value (Proceeds). Otherwise show current market value.
      const displayValue = isFullySold ? soldValue : r.marketValue;

      return {
        ...r,
        costBasis: displayBasis,
        marketValue: displayValue,
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
      const isSold = inv.status === 'Sold';

      const costBasis = isIA
          ? m.purchaseValue
          : isSold
            ? m.soldCostBasis
            : m.availableQty * (Number(inv.purchasePricePerUnit) || 0);

      const displayMarketValue = isSold ? sellProceeds : m.marketValue;

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
        marketValue: displayMarketValue,
        realizedPL: m.realizedPLDisplay,
        unrealizedPL: m.unrealizedPL,
        totalPL: m.totalPLDisplay,
        performancePct: m.performancePct,
        purchaseValue: m.purchaseValue,
        percentPortfolio: 0,
        economicValue: m.marketValue + m.realizedProceedsDisplay,

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

  const rowLabel = `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`;
  const modeLabel = mode === 'flat' ? 'Flat' : 'Aggregated';
  const statusLabel = statusFilter === 'All' ? 'All statuses' : statusFilter;

  if (rows.length === 0) {
    return (
      <div className="glass mt-2 p-4">
        <div className="rounded-xl border border-dashed border-white/[.12] px-6 py-12 text-center">
          <div className="font-headline text-[17px] font-bold">No matching assets</div>
          <div className="mt-1 text-[13px] text-muted-foreground">
            Nothing matches this view. Try a different filter.
          </div>
        </div>
      </div>
    );
  }

  // --- IA-specific rendering when filter is Interest Accounts ---
  if (IA_MODE) {
    const showPercentPortfolioCol = mode === 'aggregated';
    return (
      <TableShell title="Interest accounts" sub={`${rowLabel} · ${modeLabel} · ${statusLabel}`}>
        <table className="w-full min-w-[1000px] border-collapse">
          <thead className={THEAD_CLASS}>
            <tr className={TH_ROW_CLASS}>
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
          <tbody className={TBODY_CLASS}>
            {rows.map((r) => (
              <tr key={r.key} className={TR_CLASS}>
                <td>
                  <AssetCell name={r.name} ticker={r.ticker} />
                </td>
                <td className="text-right">{fmtRate(r.currentRatePct)}</td>
                <td className="text-right">{fmtEur.format(r.costBasis)}</td>
                <td className="text-right font-semibold">{fmtEur.format(r.marketValue)}</td>
                <td className={`text-right ${plClass(r.unrealizedPL)}`}>{fmtEur.format(r.unrealizedPL)}</td>
                <td className={`text-right ${plClass(r.performancePct)}`}>{fmtPct(r.performancePct)}</td>
                {showPercentPortfolioCol && <td className="text-right">{fmtPct(r.percentPortfolio ?? 0)}</td>}
                {mode === 'flat' && (
                  <td className="text-right">
                    <RowActions
                      onViewHistory={() => onViewHistory?.(r.invId)}
                      onAddTransaction={() => onAddTransaction?.(r.invId)}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot className={TFOOT_CLASS}>
              <tr className={TFOOT_ROW_CLASS}>
                <td className="font-body">Total</td>
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
      </TableShell>
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
  const showCostBasisCol = true; // Always show, label will change
  const showRealizedPLCol   = !(isFlat && statusFilter === 'Active');
  const showUnrealizedPLCol = !(isSoldView || (isFlat && statusFilter === 'Active'));

  return (
    <div className="w-full">
      {/* ── MOBILE VIEW: Cardified List ── */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => {
          const isIARow = r.type === 'Interest Account';
          return (
            <div
              key={r.key}
              className="glass flex cursor-pointer flex-col gap-3 p-3.5 transition-all hover:border-white/[.12]"
              onClick={() => {
                if (isFlat && onViewHistory) onViewHistory(r.invId);
              }}
            >
              {/* Header Row: Name/Ticker and Total Value */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate font-headline text-[16px] font-bold leading-tight tracking-tight">
                    {r.name}
                  </h4>
                  <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {r.ticker ? (
                      <span className="font-mono">{r.ticker}</span>
                    ) : (
                      r.type
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-[15px] font-semibold tabular-nums">
                    {fmtEur.format(r.marketValue)}
                  </div>
                  {!isIARow && (
                    <div className="text-[11px] text-muted-foreground">
                      Cost <span className="font-mono tabular-nums">{fmtEur.format(r.costBasis)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Metrics tiles */}
              {isIARow ? (
                r.currentRatePct != null && (
                  <div className="grid grid-cols-1 gap-2">
                    <MiniStat label="Rate" value={fmtRate(r.currentRatePct)} />
                  </div>
                )
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="Qty" value={fmtQty(r.availableQty)} />
                  <MiniStat
                    label="Price"
                    value={r.currentPrice != null ? fmtEur.format(r.currentPrice) : '—'}
                  />
                </div>
              )}

              {/* Footer: P/L + performance */}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
                <span className="text-[12px] text-muted-foreground">Total P/L</span>
                <div className="flex items-center gap-2.5">
                  <span className={`font-mono text-[15px] font-bold tabular-nums ${plClass(r.totalPL)}`}>
                    {fmtEur.format(r.totalPL)}
                  </span>
                  <span className={`font-mono text-[12px] font-bold tabular-nums ${plClass(r.performancePct)}`}>
                    {fmtPct(r.performancePct)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Mobile Totals Card */}
        {totals && (
          <div className="glass-strong flex flex-col gap-2 p-3.5">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Total</span>
              <div className="font-mono text-[17px] font-bold tabular-nums">
                {fmtEur.format(totals.marketValue)}
              </div>
            </div>
            <div className="flex items-end justify-between gap-3 border-t border-border pt-2.5">
              <span className="text-[12px] text-muted-foreground">
                Cost basis <span className="font-mono tabular-nums">{fmtEur.format(totals.costBasis)}</span>
              </span>
              <div className="flex flex-col items-end gap-0.5">
                <span className={`font-mono text-[15px] font-bold tabular-nums ${plClass(totals.totalPL)}`}>
                  {fmtEur.format(totals.totalPL)}
                </span>
                <span className={`font-mono text-[12px] font-bold tabular-nums ${plClass(totals.performancePct)}`}>
                  {fmtPct(totals.performancePct)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── DESKTOP VIEW: Standard Table ── */}
      <div className="hidden md:block">
        <TableShell
          title={showTypeColumn ? 'All positions' : 'Positions'}
          sub={`${rowLabel} · ${modeLabel} · ${statusLabel}`}
        >
          <table className="w-full min-w-[1000px] border-collapse">
            <thead className={THEAD_CLASS}>
              <tr className={TH_ROW_CLASS}>
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
                  {showCostBasisCol && <th className="text-right">{ isSoldView ? "Original Cost" : "Cost Basis" }</th>}
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
            <th className="text-right">Value</th>
            {showRealizedPLCol && <th className="text-right">Realized P/L</th>}
            {showUnrealizedPLCol && <th className="text-right">Unrealized P/L</th>}
            <th className="text-right">Total P/L</th>
            <th className="text-right">Performance</th>
            {showPercentPortfolioCol && <th className="text-right">% of Portfolio</th>}
            {isFlat && <th className="text-right">Actions</th>}
          </tr>
          </thead>
          <tbody className={TBODY_CLASS}>
          {rows.map((r) => {
            const isSoldRow = r.status === 'Sold';
            const isIARow = r.type === 'Interest Account';
            return (
              <tr key={r.key} className={TR_CLASS}>
                {showTypeColumn && <td className="font-body font-semibold text-muted-foreground">{r.type}</td>}
                <td>
                  <AssetCell name={r.name} ticker={r.ticker} />
                </td>

                {showPurchaseDateCol && <td className="text-muted-foreground">{r.purchaseDate ? format(parseISO(r.purchaseDate), 'dd MMM yyyy') : '—'}</td>}
                {showStatusCol && <td><StatusBadge status={r.status} /></td>}

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

                <td className="text-right font-semibold" title={isIARow ? "Balance" : undefined}>{fmtEur.format(r.marketValue)}</td>

                {showRealizedPLCol && <td className={`text-right ${plClass(r.realizedPL)}`}>{fmtEur.format(r.realizedPL)}</td>}
                {showUnrealizedPLCol && <td className={`text-right ${plClass(r.unrealizedPL)}`} title={isIARow ? "Accrued Interest" : undefined}>{fmtEur.format(r.unrealizedPL)}</td>}

                <td className={`text-right font-bold ${plClass(r.totalPL)}`}>{fmtEur.format(r.totalPL)}</td>
                <td className={`text-right ${plClass(r.performancePct)}`}>{fmtPct(r.performancePct)}</td>
                {showPercentPortfolioCol && <td className="text-right">{fmtPct(r.percentPortfolio ?? 0)}</td>}

                {isFlat && <td className="text-right">
                    <RowActions
                      onViewHistory={() => onViewHistory?.(r.invId)}
                      onAddTransaction={() => onAddTransaction?.(r.invId)}
                    />
                  </td>
                }
              </tr>
            );
          })}
          </tbody>
          {totals && (
            <tfoot className={TFOOT_CLASS}>
              <tr className={TFOOT_ROW_CLASS}>
                <td className="font-body">Total</td>
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
        </TableShell>
      </div>
    </div>
  );
}
