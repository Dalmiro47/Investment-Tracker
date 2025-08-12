
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


export const toNum = (b: Big, dp = 2) => Number(b.round(dp));
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
