/**
 * Futures PnL math for Kraken LINEAR (USD-quoted) perpetuals.
 *
 * Linear contract rules (do NOT use inverse / Coin-M formulas here):
 *   LONG  PnL = size × (price − entry)
 *   SHORT PnL = size × (entry − price)
 * The collateral currency (EUR) does not change the USD PnL; EUR conversion
 * is applied afterwards by the caller.
 *
 * Every function returns `null` instead of a number when an input is missing
 * or invalid. A missing mark price must never be treated as a price of 0:
 * that turns every open position into a −100% loss.
 *
 * Pure module: no Firebase, no React, safe to unit test.
 */

import Big from 'big.js';

export type FuturesSide = 'LONG' | 'SHORT';

/** Kraken names Bitcoin "XBT" in contract symbols (PF_XBTUSD). */
const ASSET_ALIASES: Record<string, string> = {
  BTC: 'XBT',
};

function isPositiveFinite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/** Strict side parser. Unknown input returns null, never a default side. */
export function parseFuturesSide(raw: unknown): FuturesSide | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  if (s === 'LONG') return 'LONG';
  if (s === 'SHORT') return 'SHORT';
  return null;
}

/**
 * Maps an app asset label ("XBT", "BTC", "ETH/USD Perp", "ada-perp") to the
 * Kraken perpetual symbol used by the public tickers endpoint ("PF_XBTUSD").
 * Returns null when the label cannot be a valid asset code.
 */
export function krakenPerpSymbol(asset: string | null | undefined): string | null {
  if (!asset) return null;
  const clean = asset.split('/')[0].split(' ')[0].split('-')[0].trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(clean)) return null;
  const base = ASSET_ALIASES[clean] ?? clean;
  return `PF_${base}USD`;
}

/**
 * Linear PnL in the quote currency (USD) between an entry and a reference
 * price. The reference price is the MARK price for open positions and the
 * exit price for closed ones.
 */
export function linearPnlUsd(input: {
  side: FuturesSide | null | undefined;
  size: number | null | undefined;
  entryPrice: number | null | undefined;
  price: number | null | undefined;
}): number | null {
  const { side, size, entryPrice, price } = input;
  if (side !== 'LONG' && side !== 'SHORT') return null;
  if (!isPositiveFinite(size) || !isPositiveFinite(entryPrice) || !isPositiveFinite(price)) {
    return null;
  }
  const diff = side === 'LONG'
    ? new Big(price).minus(entryPrice)
    : new Big(entryPrice).minus(price);
  return diff.times(size).toNumber();
}

/** Initial margin in USD for an isolated position: entry notional / leverage. */
export function initialMarginUsd(input: {
  size: number | null | undefined;
  entryPrice: number | null | undefined;
  leverage: number | null | undefined;
}): number | null {
  const { size, entryPrice, leverage } = input;
  if (!isPositiveFinite(size) || !isPositiveFinite(entryPrice) || !isPositiveFinite(leverage)) {
    return null;
  }
  return new Big(size).times(entryPrice).div(leverage).toNumber();
}

/**
 * Kraken's "Return on Equity": PnL divided by INITIAL MARGIN (not notional).
 * Returned as a fraction (0.05 = 5%). At 5x, a 1% price move is a 5% return.
 */
export function returnOnMargin(input: {
  pnlUsd: number | null | undefined;
  size: number | null | undefined;
  entryPrice: number | null | undefined;
  leverage: number | null | undefined;
}): number | null {
  const margin = initialMarginUsd(input);
  if (margin === null) return null;
  if (typeof input.pnlUsd !== 'number' || !Number.isFinite(input.pnlUsd)) return null;
  return new Big(input.pnlUsd).div(margin).toNumber();
}

/** USD to EUR using the position's stored rate. Null when the rate is unusable. */
export function usdToEur(
  amountUsd: number | null | undefined,
  eurPerUsd: number | null | undefined
): number | null {
  if (typeof amountUsd !== 'number' || !Number.isFinite(amountUsd)) return null;
  if (!isPositiveFinite(eurPerUsd)) return null;
  return new Big(amountUsd).times(eurPerUsd).toNumber();
}
