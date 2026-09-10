import type { Investment, Transaction, TaxSettings } from './types';
import { dec, add, sub, mul, toNum, EPS } from './money';
import { computeYearTaxSummary, type YearTaxSummary } from './portfolio';
import { isCryptoSellTaxFree } from './tax';
import { addYears, differenceInCalendarDays, format, isAfter, parseISO, startOfDay } from 'date-fns';

/**
 * "What if I sold this?" — takes the year's real tax estimate as a baseline and
 * re-scores it with hypothetical sales layered on top.
 *
 * Two deliberate modelling choices, both to stay honest about what the numbers mean:
 *
 * 1. Lot selection is FIFO across every open lot of the same security, oldest
 *    purchase first — the same order `processFifoSell` uses when the sale is
 *    actually booked, so a simulated sale consumes the lots the real one would.
 * 2. The crypto §23 window comes from `isCryptoSellTaxFree`, which knows the
 *    ten-year rule for staking/lending lots. The year aggregation in
 *    `portfolio.ts` classifies already-booked crypto sells with a flat 365-day
 *    test instead; for a staking lot that test is too generous, and a simulator
 *    that tells you "sell now, it's tax-free" when it is not would be worse than
 *    useless.
 */

/** Asset types that are sold lot-by-lot, and can therefore be simulated. */
export const SIMULATABLE_TYPES = ['Stock', 'ETF', 'Bond', 'Crypto', 'Real Estate'] as const;
export type SimulatableType = (typeof SIMULATABLE_TYPES)[number];

const isSimulatableType = (type: Investment['type']): type is SimulatableType =>
  (SIMULATABLE_TYPES as readonly string[]).includes(type);

/** One open purchase lot — in this data model, one `Investment` document. */
export interface SimulatorLot {
  investmentId: string;
  purchaseDate: string;
  buyPricePerUnit: number;
  availableQty: number;
  stakingOrLending: boolean;
}

/** All open lots of one security, grouped the way the holdings table groups them. */
export interface SimulatorAsset {
  key: string;
  name: string;
  ticker: string | null;
  type: SimulatableType;
  availableQty: number;
  /** Weighted by remaining quantity. */
  avgBuyPrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  /** False when no live price is stored; `currentPrice` then falls back to cost. */
  hasLivePrice: boolean;
  /** Oldest purchase first — FIFO order. */
  lots: SimulatorLot[];
}

export interface SalePlan {
  assetKey: string;
  quantity: number;
  pricePerUnit: number;
  /**
   * Hand-picked lots. When set, exactly these lots are sold in full and
   * `quantity` is derived from them instead of driving the FIFO walk.
   */
  lotIds?: string[];
}

export interface SimulatedLotSale {
  investmentId: string;
  purchaseDate: string;
  quantity: number;
  costBasis: number;
  proceeds: number;
  gain: number;
  /** Crypto only: outside the §23 speculation window, so the gain is not taxed. */
  taxFree: boolean;
  /** Crypto only: the day this lot leaves the §23 window, as `yyyy-MM-dd`. */
  taxFreeDate: string | null;
  /** Crypto only: days from the simulated sale date until `taxFreeDate`; 0 once reached. */
  daysUntilTaxFree: number | null;
}

export interface SimulatedAssetSale {
  assetKey: string;
  name: string;
  ticker: string | null;
  type: SimulatableType;
  quantity: number;
  pricePerUnit: number;
  proceeds: number;
  costBasis: number;
  gain: number;
  /** §20 EStG contribution (stocks, ETFs, bonds, real estate). */
  capitalIncomeDelta: number;
  /** §23 EStG contribution (crypto sold inside the speculation window). */
  shortTermCryptoDelta: number;
  /** Crypto gains outside the window — realized, but not taxed. */
  taxFreeGain: number;
  lots: SimulatedLotSale[];
  /** Quantity actually held on the sale date — lots bought later don't count. */
  availableAtSaleDate: number;
  /** The plan asked for more than was held on that date; only what existed was sold. */
  overSold: boolean;
  /** Hand-picked lots that weren't owned yet on the sale date, so they were dropped. */
  lotsExcludedByDate: number;
  /**
   * The picked lots skip over an older one. German FIFO sells the oldest lot
   * first, so a real sale could not be allocated this way — the scenario is
   * still costed as asked, but the UI should say so.
   */
  violatesFifo: boolean;
}

export interface SimulationTotals {
  proceeds: number;
  costBasis: number;
  gain: number;
  capitalIncomeDelta: number;
  shortTermCryptoDelta: number;
  taxFreeGain: number;
}

export interface SimulationResult {
  sales: SimulatedAssetSale[];
  totals: SimulationTotals;
  baseline: YearTaxSummary;
  simulated: YearTaxSummary;
  /** Extra tax the scenario would cost (negative if it saves tax). */
  taxDelta: number;
  /** Sale proceeds left after the extra tax. */
  netProceeds: number;
}

/**
 * Collects every open lot into per-security groups, ready to be sold FIFO.
 * Mirrors `calculatePositionMetrics`: remaining quantity comes from the
 * transaction ledger, not the denormalised `totalSoldQty` field.
 */
export function buildSimulatorAssets(
  investments: Investment[],
  transactionsMap: Record<string, Transaction[]>,
): SimulatorAsset[] {
  type Draft = Omit<SimulatorAsset, 'avgBuyPrice' | 'currentPrice' | 'unrealizedPL'>;
  const byKey = new Map<string, Draft>();

  for (const inv of investments) {
    if (!isSimulatableType(inv.type)) continue;
    if (!inv.purchaseQuantity || inv.purchaseQuantity <= 0) continue;

    const txs = transactionsMap[inv.id] ?? [];
    const soldQty = txs
      .filter(t => t.type === 'Sell')
      .reduce((sum, t) => add(sum, dec(t.quantity)), dec(0));
    const availableQty = toNum(sub(dec(inv.purchaseQuantity), soldQty), 8);
    if (availableQty <= EPS) continue;

    const buyPrice = inv.purchasePricePerUnit ?? 0;
    // No live price yet: value the lot at cost so the scenario shows a zero gain
    // rather than a fabricated one. `hasLivePrice` lets the UI say so.
    const hasLivePrice = inv.currentValue != null && inv.currentValue > 0;
    const unitPrice = hasLivePrice ? (inv.currentValue as number) : buyPrice;

    // Same grouping as the holdings table: one row per security.
    const key = `${inv.type}:${(inv.ticker || inv.name).toLowerCase()}`;
    let draft = byKey.get(key);
    if (!draft) {
      draft = {
        key,
        name: inv.name,
        ticker: inv.ticker ?? null,
        type: inv.type,
        availableQty: 0,
        marketValue: 0,
        costBasis: 0,
        hasLivePrice: true,
        lots: [],
      };
      byKey.set(key, draft);
    }

    draft.availableQty += availableQty;
    draft.marketValue += availableQty * unitPrice;
    draft.costBasis += availableQty * buyPrice;
    draft.hasLivePrice = draft.hasLivePrice && hasLivePrice;
    draft.lots.push({
      investmentId: inv.id,
      purchaseDate: inv.purchaseDate,
      buyPricePerUnit: buyPrice,
      availableQty,
      stakingOrLending: inv.stakingOrLending ?? false,
    });
  }

  return Array.from(byKey.values())
    .map(draft => {
      draft.lots.sort(
        (a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime(),
      );
      return {
        ...draft,
        avgBuyPrice: draft.availableQty > 0 ? draft.costBasis / draft.availableQty : 0,
        currentPrice: draft.availableQty > 0 ? draft.marketValue / draft.availableQty : 0,
        unrealizedPL: draft.marketValue - draft.costBasis,
      };
    })
    .sort((a, b) => b.marketValue - a.marketValue);
}

/** The day a crypto lot leaves the §23 speculation window (1 year, or 10 with staking/lending). */
export function cryptoTaxFreeDate(lot: SimulatorLot): Date {
  return startOfDay(addYears(parseISO(lot.purchaseDate), lot.stakingOrLending ? 10 : 1));
}

/** One lot as the picker shows it: what it would fetch, and its §23 standing. */
export interface LotPreview {
  lot: SimulatorLot;
  /** False when the lot was bought after the simulated sale date. */
  ownedAtSaleDate: boolean;
  proceeds: number;
  costBasis: number;
  gain: number;
  taxFree: boolean;
  /** Crypto only, `yyyy-MM-dd`. */
  taxFreeDate: string | null;
  daysUntilTaxFree: number | null;
}

/**
 * Describes every lot of an asset at a given price and date, so the lot picker
 * can show what each one is worth without guessing at the tax rules itself.
 */
export function previewLots(
  asset: SimulatorAsset,
  pricePerUnit: number,
  saleDate: Date,
): LotPreview[] {
  const saleDay = startOfDay(saleDate);
  const saleIso = saleDate.toISOString();
  const isCrypto = asset.type === 'Crypto';

  return asset.lots.map(lot => {
    const proceeds = mul(dec(lot.availableQty), dec(pricePerUnit));
    const costBasis = mul(dec(lot.availableQty), dec(lot.buyPricePerUnit));
    const taxFree = isCrypto && isCryptoSellTaxFree(lot.purchaseDate, saleIso, lot.stakingOrLending);
    const freeOn = isCrypto ? cryptoTaxFreeDate(lot) : null;

    return {
      lot,
      ownedAtSaleDate: !isAfter(startOfDay(parseISO(lot.purchaseDate)), saleDay),
      proceeds: toNum(proceeds),
      costBasis: toNum(costBasis),
      gain: toNum(sub(proceeds, costBasis)),
      taxFree,
      taxFreeDate: freeOn ? format(freeOn, 'yyyy-MM-dd') : null,
      daysUntilTaxFree: freeOn
        ? (taxFree ? 0 : Math.max(0, differenceInCalendarDays(freeOn, saleDay)))
        : null,
    };
  });
}

/** True when a picked set leaves an older lot behind — i.e. it isn't FIFO order. */
function skipsAnOlderLot(ownedLots: SimulatorLot[], pickedIds: Set<string>): boolean {
  let sawUnpicked = false;
  for (const lot of ownedLots) {
    if (pickedIds.has(lot.investmentId)) {
      if (sawUnpicked) return true;
    } else {
      sawUnpicked = true;
    }
  }
  return false;
}

/** Walks one plan through its asset's lots, oldest first, and buckets each lot's gain. */
export function simulateAssetSale(
  asset: SimulatorAsset,
  plan: SalePlan,
  saleDate: Date,
): SimulatedAssetSale {
  const isCrypto = asset.type === 'Crypto';
  const price = dec(plan.pricePerUnit);
  const saleIso = saleDate.toISOString();
  const saleDay = startOfDay(saleDate);

  // A lot bought after the simulated sale date isn't owned yet, so it can't be sold.
  // This matters when the scenario is dated earlier in the year than a recent purchase.
  const ownedLots = asset.lots.filter(lot => !isAfter(startOfDay(parseISO(lot.purchaseDate)), saleDay));
  const availableAtSaleDate = ownedLots.reduce((sum, lot) => sum + lot.availableQty, 0);

  // Hand-picked lots are sold whole; otherwise the quantity is walked through
  // the lots in FIFO order, splitting the last one if it doesn't divide evenly.
  const pickedIds = plan.lotIds ? new Set(plan.lotIds) : null;
  const lotsToSell = pickedIds
    ? ownedLots.filter(lot => pickedIds.has(lot.investmentId))
    : ownedLots;
  const lotsExcludedByDate = plan.lotIds
    ? plan.lotIds.filter(id => !ownedLots.some(lot => lot.investmentId === id)).length
    : 0;

  // What the scenario asks to sell: the picked lots in full, or the typed quantity.
  const requestedQty = pickedIds
    ? lotsToSell.reduce((sum, lot) => sum + lot.availableQty, 0)
    : Math.max(0, plan.quantity);
  let remaining = dec(requestedQty);
  const overSold = pickedIds ? false : plan.quantity > availableAtSaleDate + EPS;
  const violatesFifo = pickedIds ? skipsAnOlderLot(ownedLots, pickedIds) : false;

  const lots: SimulatedLotSale[] = [];
  let proceeds = dec(0);
  let costBasis = dec(0);
  let capitalIncomeDelta = dec(0);
  let shortTermCryptoDelta = dec(0);
  let taxFreeGain = dec(0);

  for (const lot of lotsToSell) {
    if (remaining.lte(EPS)) break;

    const take = remaining.gt(dec(lot.availableQty)) ? dec(lot.availableQty) : remaining;
    remaining = sub(remaining, take);

    const lotProceeds = mul(take, price);
    const lotCost = mul(take, dec(lot.buyPricePerUnit));
    const lotGain = sub(lotProceeds, lotCost);

    proceeds = add(proceeds, lotProceeds);
    costBasis = add(costBasis, lotCost);

    let taxFree = false;
    let taxFreeDate: string | null = null;
    let daysUntilTaxFree: number | null = null;

    if (isCrypto) {
      taxFree = isCryptoSellTaxFree(lot.purchaseDate, saleIso, lot.stakingOrLending);
      const freeOn = cryptoTaxFreeDate(lot);
      // Calendar day, not an instant: an ISO timestamp would render as the day
      // before in any timezone behind UTC.
      taxFreeDate = format(freeOn, 'yyyy-MM-dd');
      daysUntilTaxFree = taxFree ? 0 : Math.max(0, differenceInCalendarDays(freeOn, saleDay));

      if (taxFree) {
        taxFreeGain = add(taxFreeGain, lotGain);
      } else if (lotGain.gt(0)) {
        // Positive lot gains only — the same rule the year aggregation applies to
        // booked crypto sells, so a simulated sale scores the way a real one will.
        shortTermCryptoDelta = add(shortTermCryptoDelta, lotGain);
      }
    } else {
      // §20: gains and losses inside the bucket net against each other.
      capitalIncomeDelta = add(capitalIncomeDelta, lotGain);
    }

    lots.push({
      investmentId: lot.investmentId,
      purchaseDate: lot.purchaseDate,
      quantity: toNum(take, 8),
      costBasis: toNum(lotCost),
      proceeds: toNum(lotProceeds),
      gain: toNum(lotGain),
      taxFree,
      taxFreeDate,
      daysUntilTaxFree,
    });
  }

  return {
    assetKey: asset.key,
    name: asset.name,
    ticker: asset.ticker,
    type: asset.type,
    quantity: toNum(sub(dec(requestedQty), remaining), 8),
    pricePerUnit: plan.pricePerUnit,
    proceeds: toNum(proceeds),
    costBasis: toNum(costBasis),
    gain: toNum(sub(proceeds, costBasis)),
    capitalIncomeDelta: toNum(capitalIncomeDelta),
    shortTermCryptoDelta: toNum(shortTermCryptoDelta),
    taxFreeGain: toNum(taxFreeGain),
    lots,
    availableAtSaleDate,
    overSold,
    lotsExcludedByDate,
    violatesFifo,
  };
}

/**
 * Re-runs the year's tax estimate with the planned sales added on top of the
 * figures that produced `baseline`. Futures are untouched: they are not sold
 * lot-by-lot, so nothing in a spot scenario moves that bucket.
 *
 * The caller is responsible for keeping `saleDate` inside the estimate's year —
 * a sale booked in another year would belong to that year's return instead.
 */
export function simulateSales({
  baseline,
  assets,
  plans,
  taxSettings,
  year,
  saleDate,
}: {
  baseline: YearTaxSummary;
  assets: SimulatorAsset[];
  plans: SalePlan[];
  taxSettings: TaxSettings;
  year: number;
  saleDate: Date;
}): SimulationResult {
  const assetByKey = new Map(assets.map(a => [a.key, a]));

  const sales = plans
    .map(plan => {
      const asset = assetByKey.get(plan.assetKey);
      const hasPickedLots = (plan.lotIds?.length ?? 0) > 0;
      if (!asset || (!hasPickedLots && !(plan.quantity > 0))) return null;
      return simulateAssetSale(asset, plan, saleDate);
    })
    .filter((sale): sale is SimulatedAssetSale => sale !== null);

  const totals = sales.reduce<SimulationTotals>(
    (acc, sale) => ({
      proceeds: acc.proceeds + sale.proceeds,
      costBasis: acc.costBasis + sale.costBasis,
      gain: acc.gain + sale.gain,
      capitalIncomeDelta: acc.capitalIncomeDelta + sale.capitalIncomeDelta,
      shortTermCryptoDelta: acc.shortTermCryptoDelta + sale.shortTermCryptoDelta,
      taxFreeGain: acc.taxFreeGain + sale.taxFreeGain,
    }),
    { proceeds: 0, costBasis: 0, gain: 0, capitalIncomeDelta: 0, shortTermCryptoDelta: 0, taxFreeGain: 0 },
  );

  const simulated = computeYearTaxSummary(year, taxSettings, {
    capitalIncome: baseline.inputs.capitalIncome + totals.capitalIncomeDelta,
    shortTermCryptoGains: baseline.inputs.shortTermCryptoGains + totals.shortTermCryptoDelta,
    futuresGains: baseline.inputs.futuresGains,
    futuresLosses: baseline.inputs.futuresLosses,
  });

  const taxDelta = simulated.grandTotal - baseline.grandTotal;

  return {
    sales,
    totals,
    baseline,
    simulated,
    taxDelta,
    netProceeds: totals.proceeds - taxDelta,
  };
}
