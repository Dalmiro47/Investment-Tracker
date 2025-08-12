'use server';
import { addYears, differenceInCalendarDays, isAfter, isSameDay, parseISO } from 'date-fns';
import type { Investment } from '@/lib/types';

export interface CryptoTaxInfo {
  taxFreeDate: Date | null;       // purchaseDate + 1 year (midnight-safe)
  isEligibleNow: boolean;         // today >= taxFreeDate
  daysUntilEligible: number | null; // if not eligible yet
}

export function getCryptoTaxInfo(inv: Investment): CryptoTaxInfo {
  if (inv.type !== 'Crypto' || !inv.purchaseDate) {
    return { taxFreeDate: null, isEligibleNow: false, daysUntilEligible: null };
  }

  const p = typeof inv.purchaseDate === 'string'
    ? parseISO(inv.purchaseDate)
    : new Date(inv.purchaseDate);

  const taxFreeDate = addYears(p, 1);
  const today = new Date();

  const eligible = isAfter(today, taxFreeDate) || isSameDay(today, taxFreeDate);
  const daysUntil = eligible ? 0 : Math.max(0, differenceInCalendarDays(taxFreeDate, today));

  return {
    taxFreeDate,
    isEligibleNow: eligible,
    daysUntilEligible: daysUntil,
  };
}
