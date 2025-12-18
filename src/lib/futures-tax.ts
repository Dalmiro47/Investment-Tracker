/**
 * Futures & Derivatives Tax Calculation (§20 Abs. 6 EStG)
 * 
 * German law allows losses from Futures/Termingeschäfte to offset
 * gains, but with a maximum loss deduction of €20,000 per year
 * (€40,000 for joint filing). Excess losses carry forward.
 */

import { TAX } from './tax';

// Limits for Futures/Termingeschäfte (§20 Abs. 6 EStG)
export const FUTURES_LIMITS = {
  lossCapSingle: 20000,
  lossCapMarried: 40000, // Doubled for joint filing
};

export interface FuturesTaxInput {
  year: number;
  filing: 'single' | 'married';
  churchRate?: number;
  totalGains: number;   // Sum of all profitable trades (in EUR)
  totalLosses: number;  // Sum of all losing trades (positive absolute value in EUR)
}

export interface FuturesTaxResult {
  totalGains: number;
  totalLosses: number;
  lossCap: number;
  deductibleLosses: number; // The amount of loss actually used to reduce tax
  unusedLosses: number;     // Losses carried forward to next year
  taxableBase: number;
  baseTax: number;          // 25% tax
  soli: number;
  church: number;
  total: number;
}

/**
 * Calculates tax on Futures & Derivatives income according to §20 Abs. 6 EStG.
 * 
 * Key rule: Losses can be offset against gains, but maximum loss offset per year
 * is €20,000 (€40,000 for married filing jointly). Excess losses carry forward.
 */
export function calcFuturesTax({
  year,
  filing,
  churchRate = 0,
  totalGains,
  totalLosses
}: FuturesTaxInput): FuturesTaxResult {
  const cr = Number.isFinite(churchRate) ? churchRate : 0;
  
  // 1. Determine the loss cap (20k or 40k)
  const lossCap = filing === 'married' ? FUTURES_LIMITS.lossCapMarried : FUTURES_LIMITS.lossCapSingle;

  // 2. Calculate Taxable Base
  // The law: You can offset losses up to 20k against gains.
  // If Gains are 100k and Losses are 100k: Base = 100k - 20k = 80k.
  // If Gains are 10k and Losses are 100k: Base = 0 (can't go below zero).
  const maxOffset = Math.min(Math.abs(totalLosses), lossCap);
  const taxableBase = Math.max(0, totalGains - maxOffset);

  // 3. Calculate metrics for the UI
  // The amount of loss effectively used to reduce the taxable base this year
  const usedLosses = totalGains - taxableBase;
  
  // The remaining loss that is carried forward to next year (Verlustvortrag)
  const unusedLosses = Math.max(0, Math.abs(totalLosses) - usedLosses);

  // 4. Calculate Taxes (same flat rate logic as Capital Income)
  const baseTax = taxableBase * TAX.abgeltungsteuer;
  const soli = baseTax * TAX.soliRate;
  const church = baseTax * cr;

  return {
    totalGains,
    totalLosses: Math.abs(totalLosses),
    lossCap,
    deductibleLosses: usedLosses,
    unusedLosses,
    taxableBase,
    baseTax,
    soli,
    church,
    total: baseTax + soli + church,
  };
}
