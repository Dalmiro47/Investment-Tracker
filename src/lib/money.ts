
import Big from 'big.js';

// 20 decimals should be plenty; round half up like banks
Big.DP = 20;
Big.RM = Big.roundHalfUp;

export const dec = (n?: number | string | null) => new Big(n ?? 0);

export const add = (a: Big, b: Big) => a.plus(b);
export const sub = (a: Big, b: Big) => a.minus(b);
export const mul = (a: Big, b: Big) => a.times(b);
export const div = (a: Big, b: Big) => {
    if (b.eq(0)) return dec(0); // Avoid division by zero
    return a.div(b);
}

export function toNum(v: any, dp = 2): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  // Ethers BigNumber / Decimal.js / Big.js tolerant conversions:
  if (typeof v.toNumber === 'function') return v.toNumber();
  if (typeof v.toFixed === 'function') return Number(v.toFixed(dp));
  if (typeof v.valueOf === 'function') {
    const val = v.valueOf();
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const n = Number(val);
      if (!Number.isNaN(n)) return n;
    }
  }
  // Last resort
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export const toLocale = (n: number, options?: Intl.NumberFormatOptions) => n.toLocaleString('de-DE', options);

export const formatCurrency = (n: number | Big) => {
    const num = typeof n === 'number' ? n : toNum(n);
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(num);
};

export const formatQty = (n: number | Big) => {
    const num = typeof n === 'number' ? n : toNum(n, 8);
    return toLocale(num, { maximumFractionDigits: 8 });
}

export const formatPercent = (n: number | Big | null | undefined) => {
    if (n === null || n === undefined) return '0.00%';
    const num = typeof n === 'number' ? n : toNum(n, 4);
    if (!isFinite(num)) return '0.00%';
    return toLocale(num, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
