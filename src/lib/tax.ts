
import type { TaxSettings, Investment } from '@/lib/types';
import { addYears, differenceInCalendarDays, isAfter, isSameDay, parseISO, startOfDay } from 'date-fns';

export const TAX = {
  cryptoFreigrenze: (year: number) => (year >= 2024 ? 1000 : 600),
  sparerPauschbetrag: (filing: 'single'|'married') => (filing === 'married' ? 2000 : 1000),
  abgeltungsteuer: 0.25,      // §20 base tax
  soliRate: 0.055,            // applied on the tax
};

export function defaultCapitalAllowance(year: number, filing: 'single' | 'married'): number {
  // If law changes later, adjust here (kept simple for now)
  return filing === 'married' ? 2000 : 1000;
}

export function defaultCryptoThreshold(year: number): number {
  return year >= 2024 ? 1000 : 600;
}


export interface CapitalTaxInput {
  year: number;
  filing: 'single'|'married';
  churchRate?: number;       // church tax rate on the tax
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

export function calcCapitalTax({
  year,
  filing,
  capitalIncome,
  churchRate = 0,
}: {
  year: number;
  filing: 'single' | 'married';
  capitalIncome: number;
  churchRate?: number;
}): CapitalTaxResult {
  const cr = Number.isFinite(churchRate) ? churchRate : 0;
  const allowance = TAX.sparerPauschbetrag(filing);
  const taxableBase = Math.max(capitalIncome - allowance, 0);
  const baseTax = taxableBase * TAX.abgeltungsteuer;
  const soli = baseTax * TAX.soliRate;
  const church = baseTax * cr;
  return {
    allowance,
    allowanceUsed: Math.min(capitalIncome, allowance),
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
  churchRate?: number;
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

export function calcCryptoTax({
  year,
  marginalRate,
  shortTermGains,
  churchRate = 0,
}: {
  year: number;
  marginalRate: number;
  shortTermGains: number;
  churchRate?: number;
}): CryptoTaxResult {
  const cr = Number.isFinite(churchRate) ? churchRate : 0;
  const threshold = TAX.cryptoFreigrenze(year);
  const taxableBase = shortTermGains > threshold ? shortTermGains : 0;
  const incomeTax = taxableBase * marginalRate;
  const soli = incomeTax * TAX.soliRate;
  const church = incomeTax * cr;
  return {
    threshold,
    thresholdUsed: Math.min(shortTermGains, threshold),
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
  purchaseDate: string | null | undefined,
  sellDate: string,
  stakingOrLending: boolean
): boolean {
  if (!purchaseDate) return true; // Cannot determine, assume not taxable
  const pDate = parseISO(purchaseDate);
  const sDate = parseISO(sellDate);
  const minYears = stakingOrLending ? 10 : 1;
  const cutoffDate = addYears(pDate, minYears);
  return isAfter(sDate, cutoffDate) || isSameDay(sDate, cutoffDate);
}


// --- Functions below are for per-card estimation only ---

export interface PerInvestmentTaxInputs {
  type: 'Stock' | 'Bond' | 'Crypto' | 'Real Estate' | 'ETF' | 'Interest Account';
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

export interface CryptoTaxInfo {
  taxFreeDate: Date | null;      // purchaseDate + (1 or 10) years
  isEligibleNow: boolean;        // today >= taxFreeDate
  daysUntilEligible: number | null; // remaining days (0 if eligible)
}

/**
 * Germany: private crypto sales become tax‑free after 1 year
 * (or 10 years if staking/lending). Always returns the date + status.
 */
export function getCryptoTaxInfo(
  inv: Investment,
  opts?: { stakingOrLending?: boolean }
): CryptoTaxInfo {
  if (inv.type !== 'Crypto' || !inv.purchaseDate) {
    return { taxFreeDate: null, isEligibleNow: false, daysUntilEligible: null };
  }

  const p =
    typeof inv.purchaseDate === 'string'
      ? parseISO(inv.purchaseDate)
      : new Date(inv.purchaseDate);

  // 1 year normally; 10 years if staking/lending
  const years = (opts?.stakingOrLending ?? inv.stakingOrLending) ? 10 : 1;

  // Use midnight-safe dates to avoid off-by-one issues on DST boundaries
  const taxFreeDate = startOfDay(addYears(p, years));
  const today = startOfDay(new Date());

  const eligible = isAfter(today, taxFreeDate) || isSameDay(today, taxFreeDate);
  const daysUntil = eligible ? 0 : Math.max(0, differenceInCalendarDays(taxFreeDate, today));

  return {
    taxFreeDate,
    isEligibleNow: eligible,
    daysUntilEligible: eligible ? 0 : daysUntil,
  };
}

    
