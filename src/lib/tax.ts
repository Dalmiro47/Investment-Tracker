
import type { TaxSettings } from '@/lib/types';
import { addYears, differenceInCalendarDays, isAfter, isSameDay, parseISO } from 'date-fns';

export const TAX = {
  cryptoFreigrenze: (year: number) => (year >= 2024 ? 1000 : 600),
  sparerPauschbetrag: (filing: 'single'|'married') => (filing === 'married' ? 2000 : 1000),
  abgeltungsteuer: 0.25,      // §20 base tax
  soliRate: 0.055,            // applied on the tax
};


export interface CapitalTaxInput {
  year: number;
  filing: 'single'|'married';
  churchRate: 0 | 0.08 | 0.09;       // church tax rate on the tax
  capitalIncome: number;             // sum of §20 income (dividends + §20 gains) for the selected year
}

export interface CapitalTaxResult {
  allowance: number;
  allowanceUsed: number;
  taxableBase: number;
  baseTax: number;   // 25% of taxable base
  soli: number;      // 5.5% of baseTax
  church: number;    // churchRate * baseTax
  total: number;     // baseTax + soli + church
}

export function calcCapitalTax(i: CapitalTaxInput): CapitalTaxResult {
  const allowance = TAX.sparerPauschbetrag(i.filing);
  const taxableBase = Math.max(i.capitalIncome - allowance, 0);
  const baseTax = taxableBase * TAX.abgeltungsteuer;
  const soli = baseTax * TAX.soliRate;
  const church = baseTax * i.churchRate;
  return {
    allowance,
    allowanceUsed: Math.min(i.capitalIncome, allowance),
    taxableBase,
    baseTax,
    soli,
    church,
    total: baseTax + soli + church,
  };
}

export interface CryptoTaxInput {
  year: number;
  marginalRate: number;             // 0.14..0.45 from settings
  churchRate: 0 | 0.08 | 0.09;
  shortTermGains: number;           // sum of §23 gains with holding < 1 year
}

export interface CryptoTaxResult {
  threshold: number;
  thresholdUsed: number;            // min(shortTermGains, threshold)
  taxableBase: number;              // 0 if gains <= threshold, else full gains
  incomeTax: number;                // taxableBase * marginalRate
  soli: number;                     // incomeTax * 0.055
  church: number;                   // incomeTax * churchRate
  total: number;                    // incomeTax + soli + church
}

export function calcCryptoTax(i: CryptoTaxInput): CryptoTaxResult {
  const threshold = TAX.cryptoFreigrenze(i.year);
  const taxableBase = i.shortTermGains > threshold ? i.shortTermGains : 0;
  const incomeTax = taxableBase * i.marginalRate;
  const soli = incomeTax * TAX.soliRate;
  const church = incomeTax * i.churchRate;
  return {
    threshold,
    thresholdUsed: Math.min(i.shortTermGains, threshold),
    taxableBase,
    incomeTax,
    soli,
    church,
    total: incomeTax + soli + church,
  };
}


/**
 * Checks if a specific crypto sale is tax-free based on its holding period.
 */
export function isCryptoSellTaxFree(
  purchaseDate: string,
  sellDate: string,
  stakingOrLending: boolean
): boolean {
  const pDate = parseISO(purchaseDate);
  const sDate = parseISO(sellDate);
  const minYears = stakingOrLending ? 10 : 1;
  const cutoffDate = addYears(pDate, minYears);
  return isAfter(sDate, cutoffDate) || isSameDay(sDate, cutoffDate);
}


// --- Functions below are for per-card estimation only ---

export interface PerInvestmentTaxInputs {
  type: 'Stock' | 'Bond' | 'Crypto' | 'Real Estate' | 'ETF' | 'Savings';
  realizedPL: number;
  dividends: number;
  interest: number;
  purchaseDate?: string;
}

/**
 * Calculates tax on a single investment in isolation.
 * NOTE: This is a simplified estimate for the card view. It does not correctly
 * handle portfolio-wide allowances or thresholds.
 */
export function estimateCardTax(
  inputs: PerInvestmentTaxInputs,
  settings: TaxSettings,
): { taxBase: number; taxRate: number; tax: number; soli: number; church: number; total: number; isTaxFree: boolean; } {
  const churchRate = settings.churchTaxRate ?? 0;
  const soliPct = 0.055;
  const clamp0 = (n: number) => Math.max(0, n);

  if (inputs.type === 'Crypto') {
    const isPotentiallyTaxFree = inputs.purchaseDate ? isCryptoSellTaxFree(inputs.purchaseDate, new Date().toISOString(), false) : false;
    const taxablePL = clamp0(inputs.realizedPL);
    
    // In card view, we show tax on gain, but note it might be tax free
    const base = taxablePL;
    const incomeTax = base * (settings.cryptoMarginalRate ?? 0);
    const soli = incomeTax * soliPct;
    const churchTax = incomeTax * churchRate;
    const total = incomeTax + soli + churchTax;

    return { taxBase: base, taxRate: base > 0 ? total / base : 0, tax: incomeTax, soli, church: churchTax, total, isTaxFree: isPotentiallyTaxFree };
  }

  const gross = clamp0(inputs.realizedPL) + clamp0(inputs.dividends) + clamp0(inputs.interest);
  const allowance = TAX.sparerPauschbetrag(settings.filingStatus);
  const base = clamp0(gross - allowance); 
  const capTax = base * 0.25; 
  const soli = capTax * soliPct;
  const churchTax = capTax * churchRate; 
  const total = capTax + soli + churchTax;

  return { taxBase: base, taxRate: base > 0 ? total / base : 0, tax: capTax, soli, church: churchTax, total, isTaxFree: false };
}
