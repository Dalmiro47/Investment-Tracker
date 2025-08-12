import Big from 'big.js';

// 20 decimals should be plenty; round half up like banks
Big.DP = 20;
Big.RM = Big.roundHalfUp;

export const dec = (n?: number | string | null) => new Big(n ?? 0);

export const add = (a: number | string, b: number | string) => dec(a).plus(dec(b));
export const sub = (a: number | string, b: number | string) => dec(a).minus(dec(b));
export const mul = (a: number | string, b: number | string) => dec(a).times(dec(b));
export const div = (a: number | string, b: number | string) => {
    const divisor = dec(b);
    if (divisor.eq(0)) return dec(0); // Avoid division by zero
    return dec(a).div(divisor);
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

export const formatPercent = (n: number | Big) => {
    const num = typeof n === 'number' ? n : toNum(n, 4);
    return toLocale(num * 100, { maximumFractionDigits: 2 }) + '%';
}
