
import { parseISO, addDays, differenceInCalendarDays, isBefore, isAfter, min, max, endOfYear } from 'date-fns';
import type { SavingsTransaction, SavingsRateChange } from './types-savings';

const toDate = (s: string) => parseISO(s); // expect 'YYYY-MM-DD'
const clamp = (n: number) => (Number.isFinite(n) ? n : 0);

type Interval = {
  from: Date;   // inclusive
  to: Date;     // exclusive
  rate: number; // as decimal, e.g., 0.02
  days: number;
};

export type SavingsInput = {
  transactions: SavingsTransaction[];
  rates: SavingsRateChange[];        // sorted or not, we'll sort
  valuationDate?: string;            // default: today
  accrualMode?: 'DAILY_COMPOUND_ACT365';
  disallowNegative?: boolean;        // default true
};

export type SavingsResult = {
  finalBalance: number;
  netDeposits: number;               // Σ deposits - Σ withdrawals (principal net)
  totalInterest: number;             // finalBalance - netDeposits
  byYearInterest: Record<string, number>; // YYYY -> interest accrued in that year
  timelineSamples?: Array<{ date: string; balance: number }>;
};

export function computeSavings(input: SavingsInput): SavingsResult {
  const {
    transactions,
    rates,
    valuationDate = new Date().toISOString().slice(0,10),
    accrualMode = 'DAILY_COMPOUND_ACT365',
    disallowNegative = true,
  } = input;

  // Sort inputs
  const txs = [...transactions].sort((a,b) => a.date.localeCompare(b.date));
  const rcs = [...rates].sort((a,b) => a.from.localeCompare(b.from));

  if (rcs.length === 0) {
    // no rate provided → treat as 0% forever
    rcs.push({ from: txs[0]?.date ?? valuationDate, annualRatePct: 0 });
  }

  const startDate = txs[0]?.date
    ? min([toDate(txs[0].date), toDate(rcs[0].from)]) 
    : toDate(rcs[0].from);

  const endDateExcl = toDate(valuationDate); // accrue up to but not including valuationDate’s day end
  // Build rate intervals (piecewise constant)
  const rateBreaks: Date[] = rcs.map(r => toDate(r.from));
  const getRateAt = (d: Date): number => {
    // last rate whose from <= d
    for (let i = rcs.length - 1; i >= 0; i--) {
      if (!isAfter(toDate(rcs[i].from), d)) return rcs[i].annualRatePct / 100;
    }
    return 0;
  };

  // Index transactions by date
  let txIdx = 0;

  // Sweep day by day but in large intervals: breakpoints are:
  // - any transaction date
  // - any rate change date
  // We accrue whole days between breakpoints.
  const breakpoints = new Set<string>();
  breakpoints.add(startDate.toISOString().slice(0,10));
  breakpoints.add(valuationDate);
  txs.forEach(t => breakpoints.add(t.date));
  rcs.forEach(r => breakpoints.add(r.from));

  const sorted = [...breakpoints].sort();
  const dates: Date[] = sorted.map(toDate);

  // Current state
  let balance = 0;
  let netDeposits = 0;
  const byYearInterest: Record<string, number> = {};
  const samples: Array<{date: string; balance: number}> = [];

  // Apply any transactions on the first date before accrual
  const applyTxForDate = (dateStr: string) => {
    while (txIdx < txs.length && txs[txIdx].date === dateStr) {
      const amt = clamp(txs[txIdx].amount);
      balance += amt;
      netDeposits += amt;
      if (disallowNegative && balance < 0) balance = 0;
      txIdx++;
    }
  };

  // Iterate consecutive date ranges
  for (let i = 0; i < dates.length - 1; i++) {
    const from = dates[i];
    const to = dates[i+1];
    const fromStr = sorted[i];

    // 1) Cashflows at start of the day
    applyTxForDate(fromStr);

    // 2) Accrue from 'from' to 'to' (exclusive)
    const days = differenceInCalendarDays(to, from);
    if (days > 0 && balance > 0) {
      // If the rate might change *inside* this interval, split further by rate changes
      let cursor = from;
      while (isBefore(cursor, to)) {
        // next rate break
        const nextRateIdx = rcs.findIndex(r => isAfter(toDate(r.from), cursor));
        const nextBreak = nextRateIdx >= 0 ? min([to, toDate(rcs[nextRateIdx].from)]) : to;
        const subDays = differenceInCalendarDays(nextBreak, cursor);
        if (subDays <= 0) break;

        const rate = getRateAt(cursor);
        if (rate !== 0) {
          // ACT/365 daily compounding on current balance
          const factor = Math.pow(1 + rate/365, subDays);
          const before = balance;
          balance = before * factor;
          const interest = balance - before;
          // allocate to years proportionally by days (approx): split by calendar year borders
          allocateInterestByYear(byYearInterest, cursor, subDays, rate, before);
        }
        cursor = nextBreak;
      }
    }

    // 3) Snapshot
    samples.push({ date: fromStr, balance });
  }

  const totalInterest = balance - netDeposits;
  return {
    finalBalance: round2(balance),
    netDeposits: round2(netDeposits),
    totalInterest: round2(totalInterest),
    byYearInterest: mapValues(byYearInterest, round2),
    timelineSamples: samples,
  };
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function mapValues<T>(obj: Record<string, T>, f: (v: T)=>T) {
  const out: Record<string, T> = {};
  for (const k of Object.keys(obj)) out[k] = f(obj[k]);
  return out;
}

/**
 * Allocate interest to calendar years for reporting.
 * We approximate by splitting the sub-interval over year boundaries
 * and applying the same rate to each chunk.
 */
function allocateInterestByYear(
  bucket: Record<string, number>,
  start: Date,
  days: number,
  rate: number,
  principal: number
) {
  let cursor = start;
  let remain = days;
  let base = principal;
  while (remain > 0) {
    const yearEnd = addDays(endOfYear(cursor), 1); // exclusive
    const chunkDays = Math.min(remain, differenceInCalendarDays(yearEnd, cursor));
    const factor = Math.pow(1 + rate/365, chunkDays);
    const interest = base * (factor - 1);
    const y = String(cursor.getFullYear());
    bucket[y] = (bucket[y] ?? 0) + interest;
    // roll principal forward for next chunk
    base = base * factor;
    cursor = addDays(cursor, chunkDays);
    remain -= chunkDays;
  }
}
