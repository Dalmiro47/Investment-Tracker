
import type { Investment, TaxSettings } from '@/lib/types';
import { addYears, differenceInCalendarDays, isAfter, isSameDay, parseISO } from 'date-fns';

export const SPARER_PAUSCHBETRAG = (status: 'single' | 'married') => status === 'married' ? 2000 : 1000;
export const CRYPTO_FREIGRENZE = 600;

export interface TaxInfo {
  taxFreeDate: Date | null;
  isEligibleNow: boolean;
  daysUntilEligible: number | null;
  holdingPeriodYears: number;
}

export interface TaxInputs {
  type: Investment['type'];
  realizedPL: number;
  dividends: number;
  interest: number;
  purchaseDate?: string;
}

export function calcEstimatedTaxDue(
  inputs: TaxInputs,
  settings: TaxSettings,
  // Note: allowance is handled at the summary level, so we don't pass it here.
  // This function calculates tax on the raw inputs for this *single* investment.
): { taxBase: number; taxRate: number; tax: number; soli: number; church: number; total: number; isTaxFree: boolean; } {
  const churchRate = settings.churchTaxRate ?? 0;
  const soliPct = 0.055;
  const clamp0 = (n: number) => Math.max(0, n);

  let isTaxFree = false;

  if (inputs.type === 'Crypto') {
    if (inputs.purchaseDate) {
      const pDate = parseISO(inputs.purchaseDate);
      const holdingPeriodYears = 1; // Simplified for now
      const taxFreeDate = addYears(pDate, holdingPeriodYears);
      const today = new Date();
      // A simple check if the asset *could* be sold tax-free today.
      // The actual taxable amount comes from sales within the holding period.
      isTaxFree = isAfter(today, taxFreeDate) || isSameDay(today, taxFreeDate);
    }
    
    // For crypto, the tax base is only positive realized P/L.
    const taxablePL = clamp0(inputs.realizedPL);
    
    // In a per-card view, we can't apply the €600 Freigrenze, so we calculate tax on the gain.
    // The summary view will apply the Freigrenze to the total.
    const base = taxablePL;
    const incomeTax = base * (settings.cryptoMarginalRate ?? 0);
    const soli = incomeTax * soliPct;
    const churchTax = incomeTax * churchRate;
    const total = incomeTax + soli + churchTax;

    return { taxBase: base, taxRate: base > 0 ? total / base : 0, tax: incomeTax, soli, church: churchTax, total, isTaxFree };
  }

  // Stocks/ETFs/Savings/Bonds -> Kapitalerträge
  const gross = clamp0(inputs.realizedPL) + clamp0(inputs.dividends) + clamp0(inputs.interest);
  
  // The allowance is applied at the summary level, so we calculate tax on the full gross amount here.
  const base = gross; 
  const capTax = base * 0.25; // Abgeltungsteuer 25%
  const soli = capTax * soliPct; // 5.5% of the tax
  const churchTax = capTax * churchRate; // church on the tax
  const total = capTax + soli + churchTax;

  return { taxBase: base, taxRate: base > 0 ? total / base : 0, tax: capTax, soli, church: churchTax, total, isTaxFree };
}

/**
 * Calculates tax-free eligibility dates for a crypto investment.
 */
export function getCryptoTaxInfo(inv: Investment): TaxInfo {
  if (inv.type !== 'Crypto' || !inv.purchaseDate) {
    return { taxFreeDate: null, isEligibleNow: false, daysUntilEligible: null, holdingPeriodYears: 1 };
  }

  const p = parseISO(inv.purchaseDate);
  const holdingPeriodYears = inv.stakingOrLending ? 10 : 1;
  const taxFreeDate = addYears(p, holdingPeriodYears);
  const today = new Date();
  
  const isEligibleNow = isAfter(today, taxFreeDate) || isSameDay(today, taxFreeDate);
  const daysUntilEligible = isEligibleNow ? 0 : Math.max(0, differenceInCalendarDays(taxFreeDate, today));

  return {
    taxFreeDate,
    isEligibleNow,
    daysUntilEligible,
    holdingPeriodYears,
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


/**
 * Helper to calculate solidarity surcharge and church tax based on a base tax amount.
 */
export function addSoliAndChurch(baseTax: number, churchTaxRate: number) {
  const soli = 0.055 * baseTax;
  const church = churchTaxRate * baseTax;
  return {
    totalTax: baseTax + soli + church,
    soli,
    church,
  };
}

/**
 * Calculates tax on capital income (stocks, ETFs, interest) using the flat 25% Abgeltungsteuer.
 */
export function taxCapitalIncome(
  realizedGains: number,
  dividends: number,
  interest: number,
  allowanceLeft: number,
  settings: TaxSettings
) {
  const capitalIncome = Math.max(0, realizedGains) + Math.max(0, dividends) + Math.max(0, interest);
  if (capitalIncome <= 0) {
    return { taxable: 0, baseTax: 0, soli: 0, church: 0, totalTax: 0, allowanceUsed: 0 };
  }

  const allowanceUsed = Math.min(allowanceLeft, capitalIncome);
  const taxable = Math.max(0, capitalIncome - allowanceUsed);
  const baseTax = 0.25 * taxable;
  
  const { totalTax, soli, church } = addSoliAndChurch(baseTax, settings.churchTaxRate);

  return { taxable, baseTax, soli, church, totalTax, allowanceUsed };
}

/**
 * Calculates tax on yearly crypto gains using the user's marginal income tax rate.
 */
export function taxCryptoYear(
  realizedCryptoGainsBeforeFreigrenze: number,
  settings: TaxSettings
) {
  // Freigrenze €600: if <= 600 → all tax-free; else full amount taxable
  if (realizedCryptoGainsBeforeFreigrenze <= CRYPTO_FREIGRENZE) {
    return { taxable: 0, baseTax: 0, soli: 0, church: 0, totalTax: 0 };
  }

  const taxable = realizedCryptoGainsBeforeFreigrenze;
  const baseTax = settings.cryptoMarginalRate * taxable;
  const { totalTax, soli, church } = addSoliAndChurch(baseTax, settings.churchTaxRate);

  return { taxable, baseTax, soli, church, totalTax };
}

    