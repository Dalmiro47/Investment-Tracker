
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
