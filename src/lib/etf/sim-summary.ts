
// src/lib/etf/sim-summary.ts
import { parseISO, getYear } from 'date-fns';
import type { PlanRowDrift } from '@/lib/types.etf';
import { ENGINE_SCHEMA_VERSION } from './engine';

export type EtfSimYearBucket = {
  year: number;
  contrib: number;
  fees: number;
  endValue: number;
  endDate: string;
  cumContribToDate: number;
  unrealizedPL: number;
  performance: number;
};

export type EtfSimSummary = {
  planId: string;
  title: string;
  baseCurrency: 'EUR';
  startMonth: string;
  endMonth: string;
  lastRunAt: string; // ISO
  engineVersion: number;
  lifetime: {
    contrib: number;
    fees: number;
    marketValue: number;   // from last row
    unrealizedPL: number;  // marketValue - total lifetime contrib
    performance: number;   // unrealizedPL / max(contrib, 1)
  };
  byYear: EtfSimYearBucket[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildSimSummary(
  rows: PlanRowDrift[],
  startMonth: string,
  planMeta: { planId: string; title: string; baseCurrency: 'EUR' }
): EtfSimSummary {
  if (!rows.length) {
    return {
      planId: planMeta.planId,
      title: planMeta.title,
      baseCurrency: planMeta.baseCurrency,
      startMonth,
      endMonth: startMonth,
      lastRunAt: new Date().toISOString(),
      engineVersion: ENGINE_SCHEMA_VERSION,
      lifetime: { contrib: 0, fees: 0, marketValue: 0, unrealizedPL: 0, performance: 0 },
      byYear: []
    };
  }
  
  const endMonth = rows.length ? rows[rows.length - 1].date.slice(0, 7) : startMonth;
  const totalContrib = rows.reduce((s, r) => s + (r.contribution || 0), 0);
  const totalFees = rows.reduce((s, r) => s + (r.fees || 0), 0);
  const endValue = rows.length ? rows[rows.length - 1].portfolioValue : 0;

  const gainLoss = endValue - totalContrib - totalFees;
  const basis = totalContrib + totalFees;
  const simplePct = basis > 0 ? (gainLoss / basis) : 0;

  const byYearMap = new Map<number, {
    contrib: number; fees: number; lastValue: number; lastDate: string; cumContrib: number;
  }>();

  let runningContrib = 0;
  for (const r of rows) {
    const y = Number(r.date.slice(0, 4));
    runningContrib += r.contribution || 0;
    const m = byYearMap.get(y) ?? { contrib: 0, fees: 0, lastValue: 0, lastDate: `${y}-12-31`, cumContrib: 0 };
    m.contrib += r.contribution || 0;
    m.fees += r.fees || 0;
    m.lastValue = r.portfolioValue;
    m.lastDate = r.date;
    m.cumContrib = runningContrib;
    byYearMap.set(y, m);
  }

  const byYear = Array.from(byYearMap.entries()).map(([year, m]) => {
    const gl = m.lastValue - m.cumContrib - m.fees; // unrealized PL up to year-end based on lifetime contrib
    const perf = m.cumContrib > 0 ? (gl / m.cumContrib) : 0;
    return {
      year,
      contrib: round2(m.contrib),
      fees: round2(m.fees),
      endValue: round2(m.lastValue),
      performance: perf,
      unrealizedPL: round2(gl),
      endDate: m.lastDate,
      cumContribToDate: round2(m.cumContrib),
    };
  }).sort((a, b) => a.year - b.year);

  return {
    planId: planMeta.planId,
    title: planMeta.title,
    baseCurrency: planMeta.baseCurrency,
    startMonth,
    endMonth,
    engineVersion: ENGINE_SCHEMA_VERSION,
    lastRunAt: new Date().toISOString(),
    lifetime: {
      contrib: round2(totalContrib),
      fees: round2(totalFees),
      marketValue: round2(endValue),
      performance: simplePct,
      unrealizedPL: round2(gainLoss),
    },
    byYear,
  };
}
