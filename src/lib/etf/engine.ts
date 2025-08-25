
import { endOfMonth, eachMonthOfInterval, parseISO, format } from 'date-fns';
import type { ETFPlan, ETFComponent, ETFPricePoint, FXRatePoint, ContributionStep } from '@/lib/types.etf';
import { dec, add, sub, mul, div, toNum } from '@/lib/money';
import Big from 'big.js';

export interface PlanRow {
  date: string;                 // yyyy-MM-dd (month end)
  contribution: number;         // € contribution for the month
  fees: number;                 // optional
  portfolioValue: number;       // end-of-month total in EUR
  positions: {
    symbol: string;
    units: number;
    priceCCY: number;
    ccy: string;
    fxEURtoCCY?: number;        // EUR -> CCY rate used
    priceEUR: number;           // price in EUR
    valueEUR: number;
    targetWeight: number;
    driftPct: number;           // (actual - target)
  }[];
}

type PriceMap = Record<string, Record<string, ETFPricePoint>>; // symbol -> date -> point
type FXMap = Record<string, FXRatePoint>;                       // date -> point (EUR base)
type EngineOptions = { allocationMode?: 'fixed' | 'rebalance' };


export function getContributionForMonth(plan: ETFPlan, month: string): number {
  let amt = plan.monthContribution ?? 0;
  
  // Manual steps override (last step <= month wins)
  const steps = (plan.contributionSteps ?? []).slice().sort((a,b)=>a.month.localeCompare(b.month));
  for (const s of steps) {
    if (s.month <= month) {
      amt = s.amount;
    }
  }

  return amt;
}


export function simulatePlan(
  plan: ETFPlan,
  components: ETFComponent[],
  monthly: PriceMap,
  fx: FXMap,
  options: EngineOptions = {}
): PlanRow[] {
  const allocationMode = options.allocationMode ?? (plan.rebalanceOnContribution ? 'rebalance' : 'fixed');
  
  const toMonthKey = (isoOrDate: string | Date) => format(endOfMonth(typeof isoOrDate === 'string' ? parseISO(isoOrDate) : isoOrDate), 'yyyy-MM');

  // Remap prices to symbol -> 'YYYY-MM' -> point for alignment
  const monthlyByMonth: Record<string, Record<string, ETFPricePoint>> = {};
  for (const [symbol, byDate] of Object.entries(monthly)) {
    monthlyByMonth[symbol] = {};
    Object.values(byDate).forEach(p => {
      monthlyByMonth[symbol][toMonthKey(p.date)] = p;
    });
  }

  // Remap FX to 'YYYY-MM' -> point for alignment
  const fxByMonth: Record<string, FXRatePoint> = {};
  Object.values(fx).forEach(pt => {
    fxByMonth[toMonthKey(pt.date)] = pt;
  });

  const start = endOfMonth(parseISO(plan.startDate));
  const planStartMonth = toMonthKey(start);
  const end = endOfMonth(new Date());
  const months = eachMonthOfInterval({ start, end });

  // running state: units per symbol
  const units: Record<string, Big> = {};
  components.forEach(c => {
    const symbol = c.ticker;
    units[symbol] = dec(0)
  });

  const rows: PlanRow[] = [];

  for (const monthDate of months) {
    const monthKey = toMonthKey(monthDate);
    
    // Engine Guard: Skip any month before the plan's start date.
    if (monthKey < planStartMonth) {
        continue;
    }

    const fxPoint = fxByMonth[monthKey];
    let preValue = dec(0);

    const hasAllPrices = components.every(c => monthlyByMonth[c.ticker]?.[monthKey]);
    if (!hasAllPrices) {
        continue;
    }
    
    const monthlyContribution = getContributionForMonth(plan, monthKey);

    // --- Calculate value with previous month's units and this month's prices ---
    const initialPositions = components.map(c => {
      const symbol = c.ticker;
      const p = monthlyByMonth[symbol]?.[monthKey];
      if (!p) return null;

      const fxRate = p.currency === 'EUR' ? 1 : (fxPoint?.rates?.[p.currency] ?? null);
      if (p.currency !== 'EUR' && !fxRate) return null; // Skip if FX rate is missing
      
      const priceEUR = fxRate ? div(dec(p.close), dec(fxRate)) : dec(p.close);
      const valueEUR = mul(units[symbol] ?? dec(0), priceEUR);
      preValue = add(preValue, valueEUR);

      return {
        symbol,
        units: units[symbol] ?? dec(0),
        priceCCY: dec(p.close),
        ccy: p.currency,
        fxEURtoCCY: fxRate ?? undefined,
        priceEUR,
        valueEUR,
        targetWeight: c.targetWeight,
      };
    }).filter(Boolean) as ({ symbol: string; units: Big; priceCCY: Big; ccy: string; fxEURtoCCY: number | undefined; priceEUR: Big; valueEUR: Big; targetWeight: number; })[];

    // --- Contribution & Fee ---
    const fee = plan.feePct ? mul(dec(monthlyContribution), dec(plan.feePct)) : dec(0);
    const cashToInvest = sub(dec(monthlyContribution), fee);

    // --- Allocate contribution ---
    if (allocationMode === 'rebalance' && preValue.gt(0)) {
      const currentWeights = initialPositions.map(p => ({ symbol: p.symbol, weight: div(p.valueEUR, preValue) }));
      const needs = currentWeights.map(cw => {
        const target = dec(components.find(c => c.ticker === cw.symbol)?.targetWeight ?? 0);
        return { symbol: cw.symbol, need: sub(target, cw.weight) };
      });

      const positiveNeeds = needs.filter(n => n.need.gt(0));
      const totalPositiveNeed = positiveNeeds.reduce((sum, n) => add(sum, n.need), dec(0));

      if (totalPositiveNeed.gt(0)) {
        positiveNeeds.forEach(n => {
            const allocShare = div(n.need, totalPositiveNeed);
            const cashForSymbol = mul(cashToInvest, allocShare);
            const priceInfo = initialPositions.find(p => p.symbol === n.symbol);
            if (priceInfo && priceInfo.priceEUR.gt(0)) {
                const buyUnits = div(cashForSymbol, priceInfo.priceEUR);
                units[n.symbol] = add(units[n.symbol] ?? dec(0), buyUnits);
            }
        });
      } else { 
        components.forEach(c => {
          const symbol = c.ticker;
          const allocShare = dec(c.targetWeight);
          const cashForSymbol = mul(cashToInvest, allocShare);
          const priceInfo = initialPositions.find(p => p.symbol === symbol);
          if (priceInfo && priceInfo.priceEUR.gt(0)) {
              const buyUnits = div(cashForSymbol, priceInfo.priceEUR);
              units[symbol] = add(units[symbol] ?? dec(0), buyUnits);
          }
        });
      }

    } else { // Fixed allocation
      components.forEach(c => {
        const symbol = c.ticker;
        const cashForSymbol = mul(cashToInvest, dec(c.targetWeight));
        const priceInfo = initialPositions.find(p => p.symbol === symbol);
        if (priceInfo && priceInfo.priceEUR.gt(0)) {
            const buyUnits = div(cashForSymbol, priceInfo.priceEUR);
            units[symbol] = add(units[symbol] ?? dec(0), buyUnits);
        }
      });
    }

    // --- Recompute final position values after buying ---
    let portfolioValue = dec(0);
    const finalPositionsData = components.map(c => {
      const symbol = c.ticker;
      const p = monthlyByMonth[symbol]?.[monthKey];
      if (!p) return null;
      
      const fxRate = p.currency === 'EUR' ? 1 : (fxByMonth[monthKey]?.rates?.[p.currency] ?? null);
      if (p.currency !== 'EUR' && !fxRate) return null;
      
      const priceEUR = fxRate ? div(dec(p.close), dec(fxRate)) : dec(p.close);
      const valueEUR = mul(units[symbol] ?? dec(0), priceEUR);
      portfolioValue = add(portfolioValue, valueEUR);
      
      return {
        symbol,
        units: units[symbol] ?? dec(0),
        priceCCY: p.close,
        ccy: p.currency,
        fxEURtoCCY: p.currency === 'EUR' ? 1 : fxRate ?? undefined,
        priceEUR: toNum(priceEUR),
        valueEUR: toNum(valueEUR),
        targetWeight: c.targetWeight,
        driftPct: 0,
      };
    }).filter(Boolean) as PlanRow['positions'];

    // --- Calculate final drift ---
    finalPositionsData.forEach(pos => {
      const actualWeight = portfolioValue.gt(0) ? div(dec(pos.valueEUR), portfolioValue) : dec(0);
      pos.driftPct = toNum(sub(actualWeight, dec(pos.targetWeight)), 4);
      pos.units = toNum(units[pos.symbol] ?? dec(0), 8);
    });

    rows.push({
      date: format(monthDate, 'yyyy-MM-dd'),
      contribution: monthlyContribution,
      fees: toNum(fee),
      portfolioValue: toNum(portfolioValue),
      positions: finalPositionsData,
    });
  }

  return rows;
}
