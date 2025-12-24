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
  remainingAllowance?: number; // Optional: leftover Sparer-Pauschbetrag from capital bucket
}

export interface FuturesTaxResult {
  totalGains: number;
  totalLosses: number;
  lossCap: number;
  deductibleLosses: number; // The amount of loss actually used to reduce tax
  unusedLosses: number;     // Losses carried forward to next year
  allowanceUsed: number;    // Portion of general allowance applied to futures gains
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
  totalLosses,
  remainingAllowance = 0
}: FuturesTaxInput): FuturesTaxResult {
  const cr = Number.isFinite(churchRate) ? churchRate : 0;
  
  // 1. Determine the loss cap (20k or 40k)
  const lossCap = filing === 'married' ? FUTURES_LIMITS.lossCapMarried : FUTURES_LIMITS.lossCapSingle;

  // 2. Loss offset first, per §20 Abs. 6
  const maxOffset = Math.min(Math.abs(totalLosses), lossCap);
  const profitAfterLosses = Math.max(0, totalGains - maxOffset);

  // 3. Apply leftover capital allowance (Sparer-Pauschbetrag) if any
  const allowanceUsed = Math.min(Math.max(0, remainingAllowance), profitAfterLosses);
  const taxableBase = Math.max(0, profitAfterLosses - allowanceUsed);

  // 3. Calculate metrics for the UI
  // The amount of LOSS used is the offset applied BEFORE allowance
  // so it must not include allowance consumption
  const usedLosses = totalGains - profitAfterLosses;
  
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
    allowanceUsed,
    taxableBase,
    baseTax,
    soli,
    church,
    total: baseTax + soli + church,
  };
}
