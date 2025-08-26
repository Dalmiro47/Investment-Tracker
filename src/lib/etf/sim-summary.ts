
// src/lib/etf/sim-summary.ts
import { parseISO, getYear } from 'date-fns';
import type { PlanRow } from '@/lib/etf/engine';

export type EtfSimYearBucket = {
  year: number;
  contrib: number;        // contributions during that year
  fees: number;           // fees during that year
  endValue: number;       // portfolio value at last month of that year
  endDate: string | null; // ISO yyyy-MM-dd of that last row
  cumContribToDate: number; // lifetime contributions up to end of that year
  unrealizedPL: number;     // endValue - cumContribToDate
  performance: number;      // unrealizedPL / max(cumContribToDate, 1)
};

export type EtfSimSummary = {
  planId: string;
  title: string;
  baseCurrency: 'EUR';
  startMonth: string;
  endMonth: string;
  lastRunAt: string; // ISO
  lifetime: {
    contrib: number;
    fees: number;
    marketValue: number;   // from last row
    unrealizedPL: number;  // marketValue - total lifetime contrib
    performance: number;   // unrealizedPL / max(contrib, 1)
  };
  byYear: Record<string, EtfSimYearBucket>;
};

export function buildSimSummary(rows: PlanRow[], startMonth: string, planMeta: { planId: string; title: string; baseCurrency: 'EUR' }): EtfSimSummary {
  if (!rows.length) {
    return {
      planId: planMeta.planId,
      title: planMeta.title,
      baseCurrency: planMeta.baseCurrency,
      startMonth,
      endMonth: startMonth,
      lastRunAt: new Date().toISOString(),
      lifetime: { contrib: 0, fees: 0, marketValue: 0, unrealizedPL: 0, performance: 0 },
      byYear: {}
    };
  }

  const byYear: Record<string, EtfSimYearBucket> = {};
  let totalContrib = 0;
  let totalFees = 0;

  for (const r of rows) {
    const y = String(getYear(parseISO(r.date)));
    if (!byYear[y]) byYear[y] = { year: parseInt(y), contrib: 0, fees: 0, endValue: 0, endDate: null, cumContribToDate: 0, unrealizedPL: 0, performance: 0 };
    byYear[y].contrib += r.contribution;
    byYear[y].fees += r.fees;
    totalFees += r.fees;
    // overwrite so the last row in the year wins
    byYear[y].endValue = r.portfolioValue;
    byYear[y].endDate = r.date;
  }

  // Convert cumContribToDate to *true* lifetime cum through that year
  // (walk years in ascending order)
  let runningCum = 0;
  Object.keys(byYear).sort().forEach(y => {
    runningCum += byYear[y].contrib;
    byYear[y].cumContribToDate = runningCum;
    byYear[y].unrealizedPL = byYear[y].endValue - byYear[y].cumContribToDate;
    byYear[y].performance = byYear[y].cumContribToDate > 0 ? byYear[y].unrealizedPL / byYear[y].cumContribToDate : 0;
  });

  const last = rows[rows.length - 1];
  totalContrib = runningCum;
  const lifetimeUnrealized = last.portfolioValue - totalContrib;
  const lifetimePerf = totalContrib > 0 ? lifetimeUnrealized / totalContrib : 0;

  return {
    planId: planMeta.planId,
    title: planMeta.title,
    baseCurrency: planMeta.baseCurrency,
    startMonth,
    endMonth: last.date.slice(0, 7),
    lastRunAt: new Date().toISOString(),
    lifetime: {
      contrib: totalContrib,
      fees: totalFees,
      marketValue: last.portfolioValue,
      unrealizedPL: lifetimeUnrealized,
      performance: lifetimePerf
    },
    byYear
  };
}
