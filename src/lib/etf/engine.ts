
import { endOfMonth, eachMonthOfInterval, parseISO, format } from 'date-fns';
import type { ETFPlan, ETFComponent, ETFPricePoint, FXRatePoint } from '@/lib/types.etf';

export interface PlanRow {
  date: string;                 // yyyy-MM-dd (month end)
  contribution: number;         // € contribution for the month (after fees if you want)
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

export function simulatePlan(
  plan: ETFPlan,
  components: ETFComponent[],
  monthly: PriceMap,
  fx: FXMap
): PlanRow[] {
  const start = endOfMonth(parseISO(plan.startDate));
  const end = endOfMonth(new Date());
  const months = eachMonthOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));

  // running state: units per symbol
  const units: Record<string, number> = {};
  components.forEach(c => (units[c.ticker ?? c.isin] = 0));

  const rows: PlanRow[] = [];

  for (const date of months) {
    const fxPoint = fx[date];
    let preValue = 0;

    // --- Calculate value with previous month's units and this month's prices ---
    const initialPositions = components.map(c => {
      const symbol = c.ticker ?? c.isin;
      const p = monthly[symbol]?.[date];
      if (!p) return null;

      // Convert CCY->EUR: price_EUR = price_CCY / (EUR→CCY rate)
      const fxRate = p.currency === 'EUR' ? 1 : (fxPoint?.rates?.[p.currency] ?? null);
      const priceEUR = fxRate ? p.close / fxRate : p.close; // pass-through if unknown fx
      const valueEUR = (units[symbol] ?? 0) * priceEUR;
      preValue += valueEUR;

      return {
        symbol,
        units: units[symbol] ?? 0,
        priceCCY: p.close,
        ccy: p.currency,
        fxEURtoCCY: p.currency === 'EUR' ? 1 : fxRate ?? undefined,
        priceEUR,
        valueEUR,
        targetWeight: c.targetWeight,
        driftPct: 0,
      };
    }).filter(Boolean) as PlanRow['positions'];

    // --- Contribution & Fee ---
    const fee = plan.feePct ? plan.monthContribution * plan.feePct : 0;
    const cashToInvest = plan.monthContribution - fee;

    // --- Allocate contribution ---
    if (plan.rebalanceOnContribution && preValue > 0) {
      // Steer cash by drift to bring portfolio closer to targets
      const currentWeights = initialPositions.map(p => ({ symbol: p.symbol, weight: p.valueEUR / preValue }));
      const needs = currentWeights.map(cw => {
        const target = components.find(c => (c.ticker ?? c.isin) === cw.symbol)?.targetWeight ?? 0;
        return { symbol: cw.symbol, need: target - cw.weight };
      });

      const positiveNeeds = needs.filter(n => n.need > 0);
      const totalPositiveNeed = positiveNeeds.reduce((sum, n) => sum + n.need, 0);

      if (totalPositiveNeed > 0) {
        positiveNeeds.forEach(n => {
            const allocShare = n.need / totalPositiveNeed;
            const cashForSymbol = cashToInvest * allocShare;
            const priceInfo = initialPositions.find(p => p.symbol === n.symbol);
            if (priceInfo && priceInfo.priceEUR > 0) {
                const buyUnits = cashForSymbol / priceInfo.priceEUR;
                units[n.symbol] = (units[n.symbol] ?? 0) + buyUnits;
            }
        });
      } else { // if no drift, or all negative drift, allocate by target
        components.forEach(c => {
          const allocShare = c.targetWeight;
          const cashForSymbol = cashToInvest * allocShare;
          const priceInfo = initialPositions.find(p => (p.symbol) === (c.ticker ?? c.isin));
          if (priceInfo && priceInfo.priceEUR > 0) {
              const buyUnits = cashForSymbol / priceInfo.priceEUR;
              units[c.symbol] = (units[c.symbol] ?? 0) + buyUnits;
          }
        });
      }

    } else {
      // Proportional to targets if not rebalancing or if it's the first month
      components.forEach(c => {
        const cashForSymbol = cashToInvest * c.targetWeight;
        const priceInfo = initialPositions.find(p => (p.symbol) === (c.ticker ?? c.isin));
        if (priceInfo && priceInfo.priceEUR > 0) {
            const buyUnits = cashForSymbol / priceInfo.priceEUR;
            units[c.symbol] = (units[c.symbol] ?? 0) + buyUnits;
        }
      });
    }

    // --- Recompute final position values after buying ---
    const finalPositions = components.map(c => {
      const symbol = c.ticker ?? c.isin;
      const p = monthly[symbol]?.[date];
      if (!p) return null;
      const fxRate = p.currency === 'EUR' ? 1 : (fx[date]?.rates?.[p.currency] ?? null);
      const priceEUR = fxRate ? p.close / fxRate : p.close;
      const valueEUR = (units[symbol] ?? 0) * priceEUR;
      return {
        symbol,
        units: units[symbol] ?? 0,
        priceCCY: p.close,
        ccy: p.currency,
        fxEURtoCCY: p.currency === 'EUR' ? 1 : fxRate ?? undefined,
        priceEUR,
        valueEUR,
        targetWeight: c.targetWeight,
        driftPct: 0, // will be filled below
      };
    }).filter(Boolean) as PlanRow['positions'];

    const portfolioValue = finalPositions.reduce((s, x) => s + x.valueEUR, 0);

    // --- Calculate final drift ---
    finalPositions.forEach(pos => {
      const actualWeight = portfolioValue > 0 ? pos.valueEUR / portfolioValue : 0;
      pos.driftPct = actualWeight - pos.targetWeight;
    });

    rows.push({
      date,
      contribution: plan.monthContribution,
      fees: fee,
      portfolioValue,
      positions: finalPositions,
    });
  }

  return rows;
}
