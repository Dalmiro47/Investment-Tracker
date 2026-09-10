"use client";

import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarClock, Info, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react';
import AppDatePicker from '@/components/ui/app-date-picker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NumericInput } from '@/components/ui/numeric-input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { TaxSettings } from '@/lib/types';
import type { YearTaxSummary } from '@/lib/portfolio';
import {
  previewLots,
  simulateSales,
  type SalePlan,
  type SimulatorAsset,
} from '@/lib/tax-simulator';

interface TaxSimulatorProps {
  /** The year's real estimate, used as the "before" side of every comparison. */
  baseline: YearTaxSummary;
  assets: SimulatorAsset[];
  taxSettings: TaxSettings;
  year: number;
}

/** FIFO by quantity, or hand-picked whole lots. */
type Mode = 'fifo' | 'lots';
type Draft = { mode: Mode; quantity: number | null; price: number | null; lotIds: string[] };

/** Crypto prices need more decimals than a share price; keep both readable. */
const roundPrice = (value: number) => Number(value.toFixed(value >= 1 ? 2 : 6));

const formatQty = (qty: number) =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 8 }).format(qty);

function DeltaBadge({ value }: { value: number }) {
  // A scenario that costs tax is the "bad" direction here, so the colours are
  // inverted relative to a P/L chip: more tax = red.
  const costsTax = value > 0.005;
  const savesTax = value < -0.005;
  return (
    <span
      className={cn(
        'inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 font-mono text-[12px] font-bold',
        costsTax && 'border-destructive/30 bg-destructive/[.12] text-destructive',
        savesTax && 'border-success/30 bg-success/[.12] text-success',
        !costsTax && !savesTax && 'border-border bg-black/[.28] text-muted-foreground',
      )}
    >
      {costsTax && <TrendingUp className="h-3.5 w-3.5" />}
      {savesTax && <TrendingDown className="h-3.5 w-3.5" />}
      {value > 0 ? `+${formatCurrency(value)}` : formatCurrency(value)}
    </span>
  );
}

export function TaxSimulator({ baseline, assets, taxSettings, year }: TaxSimulatorProps) {
  const yearStart = useMemo(() => new Date(year, 0, 1), [year]);
  const yearEnd = useMemo(() => new Date(year, 11, 31), [year]);

  // A sale only lands in this year's return if it happens inside the year, so the
  // picker is clamped to it. Today is the obvious default when the year is current.
  const [saleDate, setSaleDate] = useState<Date>(() => {
    const today = new Date();
    if (today < yearStart) return yearStart;
    if (today > yearEnd) return yearEnd;
    return today;
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const plans: SalePlan[] = useMemo(
    () =>
      Object.entries(drafts)
        .map(([assetKey, draft]) => ({
          assetKey,
          quantity: draft.mode === 'lots' ? 0 : draft.quantity ?? 0,
          pricePerUnit: draft.price ?? 0,
          lotIds: draft.mode === 'lots' ? draft.lotIds : undefined,
        }))
        .filter(plan => (plan.lotIds?.length ?? 0) > 0 || plan.quantity > 0),
    [drafts],
  );

  const result = useMemo(
    () => simulateSales({ baseline, assets, plans, taxSettings, year, saleDate }),
    [baseline, assets, plans, taxSettings, year, saleDate],
  );

  const salesByKey = useMemo(
    () => new Map(result.sales.map(sale => [sale.assetKey, sale])),
    [result.sales],
  );

  const toggleAsset = (asset: SimulatorAsset, checked: boolean) => {
    setDrafts(prev => {
      const next = { ...prev };
      if (checked) {
        next[asset.key] = {
          mode: 'fifo',
          quantity: asset.availableQty,
          price: roundPrice(asset.currentPrice),
          lotIds: [],
        };
      } else {
        delete next[asset.key];
      }
      return next;
    });
  };

  const updateDraft = (key: string, patch: Partial<Draft>) => {
    setDrafts(prev => (prev[key] ? { ...prev, [key]: { ...prev[key], ...patch } } : prev));
  };

  /** Switching modes carries the current selection over, so nothing is retyped. */
  const changeMode = (asset: SimulatorAsset, mode: Mode) => {
    const draft = drafts[asset.key];
    if (!draft || draft.mode === mode) return;

    if (mode === 'lots') {
      // Start from whatever FIFO was already taking whole; if it took none in
      // full (one partially consumed lot), start from everything owned.
      const sale = salesByKey.get(asset.key);
      const fullyTaken = asset.lots
        .filter(lot =>
          sale?.lots.some(
            sold =>
              sold.investmentId === lot.investmentId && sold.quantity >= lot.availableQty - 1e-8,
          ),
        )
        .map(lot => lot.investmentId);
      updateDraft(asset.key, {
        mode,
        lotIds: fullyTaken.length > 0 ? fullyTaken : asset.lots.map(lot => lot.investmentId),
      });
    } else {
      const picked = new Set(draft.lotIds);
      const quantity = asset.lots
        .filter(lot => picked.has(lot.investmentId))
        .reduce((sum, lot) => sum + lot.availableQty, 0);
      updateDraft(asset.key, { mode, quantity: quantity > 0 ? quantity : asset.availableQty });
    }
  };

  const toggleLot = (assetKey: string, lotId: string, checked: boolean) => {
    setDrafts(prev => {
      const draft = prev[assetKey];
      if (!draft) return prev;
      const lotIds = checked ? [...draft.lotIds, lotId] : draft.lotIds.filter(id => id !== lotId);
      return { ...prev, [assetKey]: { ...draft, lotIds } };
    });
  };

  const allowanceBefore = Math.max(
    0,
    (baseline.capitalTaxResult.allowance ?? 0) - (baseline.capitalTaxResult.allowanceUsed ?? 0),
  );
  const allowanceAfter = Math.max(
    0,
    (result.simulated.capitalTaxResult.allowance ?? 0) -
      (result.simulated.capitalTaxResult.allowanceUsed ?? 0),
  );

  const hasPlans = result.sales.length > 0;
  const booked = baseline.inputs;
  const hasFutures = booked.futuresGains !== 0 || booked.futuresLosses !== 0;

  return (
    <div className="space-y-4">
      {/* Starting point — everything already booked in the year. */}
      <div className="rounded-[10px] border border-border bg-black/[.28] p-4">
        <h4 className="mb-3 font-semibold">Where you stand in {year}</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">
              Capital income booked <span className="text-xs">(sales, dividends, interest)</span>
            </span>
            <span className="shrink-0 font-mono">{formatCurrency(booked.capitalIncome)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Crypto gains booked (≤1y)</span>
            <span className="shrink-0 font-mono">
              {formatCurrency(booked.shortTermCryptoGains)}
            </span>
          </div>
          {hasFutures && (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Futures gains / losses</span>
              <span className="shrink-0 font-mono">
                {formatCurrency(booked.futuresGains)} / −{formatCurrency(booked.futuresLosses)}
              </span>
            </div>
          )}
          <Separator className="my-1" />
          <div className="flex justify-between gap-3 font-medium">
            <span>Tax as it stands</span>
            <span className="shrink-0 font-mono">{formatCurrency(baseline.grandTotal)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Every scenario below is added on top of these figures, and the positions listed already
            have their sold quantities taken out.
          </p>
        </div>
      </div>

      {/* Scenario controls */}
      <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-black/[.28] p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <CalendarClock size={20} className="text-warning" /> Sale date
          </span>
          <AppDatePicker
            value={saleDate}
            onChange={date => date && setSaleDate(date)}
            minDate={yearStart}
            maxDate={yearEnd}
            className="w-full sm:w-[180px]"
          />
          <p className="text-xs text-muted-foreground">
            Any day in {year}. For crypto this is what decides the one-year rule.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="self-start sm:self-auto"
          onClick={() => setDrafts({})}
          disabled={Object.keys(drafts).length === 0}
        >
          <RotateCcw size={20} /> Reset
        </Button>
      </div>

      {/* Position picker */}
      {assets.length === 0 ? (
        <div className="rounded-[10px] border border-border bg-black/[.28] p-4 text-sm text-muted-foreground">
          No open positions left to sell. Stocks, ETFs, Bonds, Crypto and Real Estate appear here
          while they still have quantity; Futures and Interest Accounts are not sold lot by lot, so
          they stay out of the simulation and keep their real figures above.
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map(asset => {
            const draft = drafts[asset.key];
            const selected = Boolean(draft);
            const sale = salesByKey.get(asset.key);
            const pendingLots = sale?.lots.filter(lot => !lot.taxFree && lot.daysUntilTaxFree) ?? [];
            // FIFO order means the last pending lot is the newest, so its date frees them all.
            const lastPending = pendingLots[pendingLots.length - 1];
            // Keys carry ':' and spaces; ids must not.
            const checkboxId = `sim-${asset.key.replace(/[^a-z0-9]+/gi, '-')}`;
            const previews =
              selected && draft
                ? previewLots(asset, draft.price ?? asset.currentPrice, saleDate)
                : [];
            const pickedQty = draft
              ? asset.lots
                  .filter(lot => draft.lotIds.includes(lot.investmentId))
                  .reduce((sum, lot) => sum + lot.availableQty, 0)
              : 0;

            return (
              <div
                key={asset.key}
                className={cn(
                  'rounded-[10px] border p-3 transition-colors',
                  selected ? 'border-primary/45 bg-primary/[.06]' : 'border-border bg-black/[.28]',
                )}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={checkboxId}
                    checked={selected}
                    onCheckedChange={checked => toggleAsset(asset, checked === true)}
                    className="mt-0.5"
                  />
                  <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="truncate text-[13px] font-semibold">{asset.name}</span>
                      {asset.ticker && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {asset.ticker}
                        </span>
                      )}
                      <span className="rounded-[5px] border border-border px-1.5 text-[10px] text-muted-foreground">
                        {asset.type}
                      </span>
                      {asset.lots.length > 1 && (
                        <span className="text-[10px] text-muted-foreground">
                          {asset.lots.length} lots
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>
                        {formatQty(asset.availableQty)} units @{' '}
                        <span className="font-mono">{formatCurrency(asset.avgBuyPrice)}</span>
                      </span>
                      <span>
                        Now <span className="font-mono">{formatCurrency(asset.currentPrice)}</span>
                      </span>
                      <span
                        className={cn(
                          'font-mono',
                          asset.unrealizedPL >= 0 ? 'text-success' : 'text-destructive',
                        )}
                      >
                        {formatCurrency(asset.unrealizedPL)}
                      </span>
                    </div>
                    {!asset.hasLivePrice && (
                      <p className="mt-1 flex items-start gap-1.5 text-[11px] text-warning">
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        No live price stored — priced at cost, so enter one below.
                      </p>
                    )}
                  </label>
                </div>

                {selected && draft && (
                  <div className="mt-3 space-y-3 border-t border-dashed border-border pt-3">
                    {asset.lots.length > 1 && (
                      <Tabs
                        value={draft.mode}
                        onValueChange={value => changeMode(asset, value as Mode)}
                      >
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="fifo" className="text-[12px]">
                            Quantity (FIFO)
                          </TabsTrigger>
                          <TabsTrigger value="lots" className="text-[12px]">
                            Pick lots
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[11px] text-muted-foreground">Quantity</span>
                        {draft.mode === 'lots' ? (
                          <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 font-mono text-sm tabular-nums text-muted-foreground">
                            {formatQty(pickedQty)}
                          </div>
                        ) : (
                          <NumericInput
                            value={draft.quantity}
                            onCommit={n =>
                              updateDraft(asset.key, {
                                quantity: n == null ? null : Math.min(n, asset.availableQty),
                              })
                            }
                            placeholder={formatQty(asset.availableQty)}
                            allowDecimal
                          />
                        )}
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] text-muted-foreground">Price per unit</span>
                        <NumericInput
                          value={draft.price}
                          onCommit={n => updateDraft(asset.key, { price: n })}
                          placeholder={String(roundPrice(asset.currentPrice))}
                          allowDecimal
                        />
                      </div>
                    </div>

                    {/* Lot picker — one row per purchase; the quantity follows the ticks. */}
                    {draft.mode === 'lots' && (
                      <div className="space-y-1.5">
                        {previews.map(preview => {
                          const lotId = `${checkboxId}-lot-${preview.lot.investmentId}`;
                          const isPicked = draft.lotIds.includes(preview.lot.investmentId);
                          return (
                            <div
                              key={preview.lot.investmentId}
                              className={cn(
                                'flex items-start gap-2.5 rounded-[8px] border px-2.5 py-2',
                                isPicked && preview.ownedAtSaleDate
                                  ? 'border-primary/35 bg-primary/[.06]'
                                  : 'border-border',
                                !preview.ownedAtSaleDate && 'opacity-50',
                              )}
                            >
                              <Checkbox
                                id={lotId}
                                checked={isPicked}
                                disabled={!preview.ownedAtSaleDate}
                                onCheckedChange={checked =>
                                  toggleLot(asset.key, preview.lot.investmentId, checked === true)
                                }
                                className="mt-0.5"
                              />
                              <label htmlFor={lotId} className="min-w-0 flex-1 cursor-pointer">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px]">
                                  <span className="font-mono">
                                    {formatQty(preview.lot.availableQty)} @{' '}
                                    {formatCurrency(preview.lot.buyPricePerUnit)}
                                  </span>
                                  <span
                                    className={cn(
                                      'font-mono font-semibold',
                                      preview.gain >= 0 ? 'text-success' : 'text-destructive',
                                    )}
                                  >
                                    {formatCurrency(preview.gain)}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                                  <span>
                                    bought {format(parseISO(preview.lot.purchaseDate), 'dd.MM.yyyy')}
                                  </span>
                                  {preview.lot.stakingOrLending && <span>staking</span>}
                                  {preview.taxFree && (
                                    <span className="rounded-[5px] border border-success/30 bg-success/[.12] px-1.5 font-semibold text-success">
                                      tax-free
                                    </span>
                                  )}
                                  {!preview.taxFree && preview.daysUntilTaxFree != null && (
                                    <span className="text-warning">
                                      tax-free in {preview.daysUntilTaxFree} days (
                                      {format(parseISO(preview.taxFreeDate as string), 'dd.MM.yyyy')}
                                      )
                                    </span>
                                  )}
                                  {!preview.ownedAtSaleDate && (
                                    <span className="text-warning">not owned on the sale date</span>
                                  )}
                                </div>
                              </label>
                            </div>
                          );
                        })}

                        {sale?.violatesFifo && (
                          <p className="text-[11px] text-warning">
                            This picks a newer lot while an older one stays. German FIFO sells the
                            oldest first, so a real sale would be taxed on the older lots instead.
                          </p>
                        )}
                        {(sale?.lotsExcludedByDate ?? 0) > 0 && (
                          <p className="text-[11px] text-warning">
                            {sale?.lotsExcludedByDate} picked lot(s) weren&apos;t owned yet on{' '}
                            {format(saleDate, 'dd.MM.yyyy')} and were left out.
                          </p>
                        )}
                      </div>
                    )}

                    {sale && sale.quantity <= 0 && (
                      <p className="text-[11px] text-warning">
                        Nothing was held on {format(saleDate, 'dd.MM.yyyy')} — this position was
                        bought later in the year. Move the sale date forward to include it.
                      </p>
                    )}

                    {sale && sale.quantity > 0 && (
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex justify-between text-muted-foreground">
                          <span>
                            Proceeds{' '}
                            <span className="font-mono">{formatCurrency(sale.proceeds)}</span>
                          </span>
                          <span>
                            Gain{' '}
                            <span
                              className={cn(
                                'font-mono',
                                sale.gain >= 0 ? 'text-success' : 'text-destructive',
                              )}
                            >
                              {formatCurrency(sale.gain)}
                            </span>
                          </span>
                        </div>

                        {/* In FIFO mode this shows which lots the sale would consume; in lot
                            mode the picker above already says it. */}
                        {draft.mode === 'fifo' &&
                          sale.lots.map(lot => (
                            <div
                              key={lot.investmentId}
                              className="flex items-center justify-between gap-2 border-l-2 border-muted pl-2 text-muted-foreground"
                            >
                              <span className="truncate">
                                {formatQty(lot.quantity)} from{' '}
                                {format(parseISO(lot.purchaseDate), 'dd.MM.yyyy')}
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                {lot.taxFree && (
                                  <span className="rounded-[5px] border border-success/30 bg-success/[.12] px-1.5 text-[10px] font-semibold text-success">
                                    tax-free
                                  </span>
                                )}
                                <span
                                  className={cn(
                                    'font-mono',
                                    lot.gain >= 0 ? 'text-success' : 'text-destructive',
                                  )}
                                >
                                  {formatCurrency(lot.gain)}
                                </span>
                              </span>
                            </div>
                          ))}

                        {sale.taxFreeGain !== 0 && (
                          <p className="text-success">
                            {formatCurrency(sale.taxFreeGain)} of this gain falls outside the §23
                            one-year window and is not taxed.
                          </p>
                        )}

                        {lastPending && draft.mode === 'fifo' && (
                          <p className="text-warning">
                            Hold{' '}
                            {formatQty(pendingLots.reduce((sum, lot) => sum + lot.quantity, 0))}{' '}
                            units until{' '}
                            {format(parseISO(lastPending.taxFreeDate as string), 'dd.MM.yyyy')} (
                            {lastPending.daysUntilTaxFree} days) and that part becomes tax-free too.
                          </p>
                        )}

                        {sale.overSold && (
                          <p className="text-warning">
                            Only {formatQty(sale.availableAtSaleDate)} units were held on{' '}
                            {format(saleDate, 'dd.MM.yyyy')} — the rest was ignored.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Outcome */}
      <div className="rounded-[10px] border border-border bg-black/[.28] p-4">
        <h4 className="mb-3 font-semibold">Scenario result</h4>

        {!hasPlans ? (
          <p className="text-sm text-muted-foreground">
            Tick a position above to see what selling it would do to your {year} tax bill.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sale proceeds</span>
              <span className="font-mono">{formatCurrency(result.totals.proceeds)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Realized gain / loss</span>
              <span
                className={cn(
                  'font-mono',
                  result.totals.gain >= 0 ? 'text-success' : 'text-destructive',
                )}
              >
                {formatCurrency(result.totals.gain)}
              </span>
            </div>

            <div className="space-y-1 border-l-2 border-primary/20 pl-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Adds to capital income (§20)</span>
                <span className="font-mono">{formatCurrency(result.totals.capitalIncomeDelta)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Adds to crypto gains (§23)</span>
                <span className="font-mono">
                  {formatCurrency(result.totals.shortTermCryptoDelta)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax-free crypto gain</span>
                <span className="font-mono text-success">
                  {formatCurrency(result.totals.taxFreeGain)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Allowance left</span>
                <span className="font-mono">
                  {formatCurrency(allowanceBefore)} → {formatCurrency(allowanceAfter)}
                </span>
              </div>
            </div>

            <Separator className="my-1" />

            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax as it stands</span>
              <span className="font-mono">{formatCurrency(baseline.grandTotal)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Tax after this sale</span>
              <span className="font-mono">{formatCurrency(result.simulated.grandTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Extra tax</span>
              <DeltaBadge value={result.taxDelta} />
            </div>

            <div className="mt-2 flex items-baseline justify-between border-t border-dashed pt-2 font-bold">
              <span>Proceeds after tax</span>
              <span className="font-mono text-base">{formatCurrency(result.netProceeds)}</span>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        By default lots are sold oldest first (FIFO), the way the app books a real sale. Futures and
        interest keep their real values. This is an estimate, not tax advice.
      </p>
    </div>
  );
}
