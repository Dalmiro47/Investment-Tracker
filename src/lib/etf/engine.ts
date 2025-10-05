

import { endOfMonth, parseISO, format, addMonths as addMonthsFns, subMonths as subMonthsFns } from 'date-fns';
import type { ETFPlan, ETFComponent, ETFPricePoint, FXRatePoint, PlanRowDrift, SimulationRows, PlanRowPerformance } from '@/lib/types.etf';
import { dec, add, sub, mul, div, toNum, EPS } from '@/lib/money';
import Big from 'big.js';
import { getStartMonth } from '@/lib/date-helpers';

type PriceMap = Record<string, Record<string, ETFPricePoint>>;
type FXMap = Record<string, FXRatePoint>;
type EngineOptions = { 
  allocationMode?: 'fixed' | 'rebalance';
  endMonth?: string;
};

const monthsBetweenInclusive = (start: string, end: string) => {
  const out: string[] = [];
  let current = parseISO(`${start}-01`);
  const endDate = parseISO(`${end}-01`);
  while (current <= endDate) {
    out.push(format(current, 'yyyy-MM'));
    current = addMonthsFns(current, 1);
  }
  return out;
};

export function getContributionForMonth(plan: ETFPlan, month: string): number {
  if (month < getStartMonth(plan)) return 0;
  
  let amt = plan.monthContribution ?? 0;
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
  monthlyByMonth: PriceMap, 
  fxByMonth: FXMap,         
  options: EngineOptions = {}
): SimulationRows {
  const allocationMode = options.allocationMode ?? (plan.rebalanceOnContribution ? 'rebalance' : 'fixed');
  
  const planStartMonth = getStartMonth(plan);
  const endMonth = options.endMonth ?? new Date().toISOString().slice(0,7);
  
  const months = monthsBetweenInclusive(planStartMonth, endMonth);

  const driftRows: PlanRowDrift[] = [];
  const performanceRows: PlanRowPerformance[] = [];

  const unitsByEtf: Record<string, Big> = {};
  const cumContribByEtf: Record<string, Big> = {};
  const prevPriceByEtf: Record<string, Big | undefined> = {};
  let monthsElapsed = 0;

  components.forEach(c => {
    unitsByEtf[c.id] = dec(0);
    cumContribByEtf[c.id] = dec(0);
    prevPriceByEtf[c.id] = undefined;

    // Preload previous month's price if available for first month return calc
    const prevMonthStr = format(subMonthsFns(parseISO(`${planStartMonth}-01`), 1), 'yyyy-MM');
    const basePrice = getBasePrice(c.ticker, prevMonthStr);
    if (basePrice) {
        prevPriceByEtf[c.id] = basePrice;
    }
  });

  function getBasePrice(symbol: string, month: string): Big | null {
    const p = monthlyByMonth[symbol]?.[month];
    if (!p) return null;
    const fxRate = p.currency === 'EUR' ? 1 : (fxByMonth[month]?.rates?.[p.currency] ?? null);
    if (p.currency !== 'EUR' && !fxRate) return null;
    return fxRate ? div(dec(p.close), dec(fxRate)) : dec(p.close);
  }

  for (const monthKey of months) {
    if (monthKey < planStartMonth) continue;

    const unitsStartByEtf: Record<string, Big> = {};
    for (const comp of components) unitsStartByEtf[comp.id] = unitsByEtf[comp.id];

    let monthlyContribution = getContributionForMonth(plan, monthKey);

    const hasAllPrices = components.every(c => monthlyByMonth[c.ticker]?.[monthKey]);
    if (!hasAllPrices) continue;

    const priceNowByEtf: Record<string, Big> = {};
    let canProceed = true;
    for (const comp of components) {
      const price = getBasePrice(comp.ticker, monthKey);
      if (price === null) {
        canProceed = false;
        break;
      }
      priceNowByEtf[comp.id] = price;
    }
    if (!canProceed) continue;

    let preValue = dec(0);
    const preValuePositions = components.map(c => {
      const valueEUR = mul(unitsStartByEtf[c.id], priceNowByEtf[c.id]);
      preValue = add(preValue, valueEUR);
      return { symbol: c.ticker, valueEUR };
    });

    // --- compute Admin fees ON NAV (before contribution), separate bucket ---
    let adminFeeThisMonth = dec(0);
    if (plan.adminFee && preValue.gt(0)) {
        if (plan.adminFee.annualPercent) {
            // annualPercent is stored as a FRACTION (e.g. 0.002 for 0.20%/yr)
            const monthlyRate = plan.adminFee.applyProRataMonthly === false ? 0 : plan.adminFee.annualPercent / 12;
            adminFeeThisMonth = add(adminFeeThisMonth, mul(preValue, dec(monthlyRate)));
        }
        if (plan.adminFee.fixedPerMonthEUR) {
            adminFeeThisMonth = add(adminFeeThisMonth, dec(plan.adminFee.fixedPerMonthEUR));
        }
    }

    // --- SELL units pro-rata to pay Admin fees (reduce NAV) ---
    if (adminFeeThisMonth.gt(0) && preValue.gt(0)) {
        const feeRatio = div(adminFeeThisMonth, preValue); // 0..1
        for (const c of components) {
            const id = c.id;
            const priceNow = priceNowByEtf[id];
            if (priceNow.lte(0)) continue;

            const valueEUR = mul(unitsByEtf[id], priceNow);
            const valueToSell = mul(valueEUR, feeRatio);
            const unitsToSell = div(valueToSell, priceNow);
            // clamp
            unitsByEtf[id] = unitsByEtf[id].gt(unitsToSell) ? sub(unitsByEtf[id], unitsToSell) : dec(0);
        }
    }

    // --- Front-load (sales cost) on THIS MONTH's contribution only ---
    let frontFeeThisMonth = dec(0);
    if (plan.frontloadFee) {
        const isFeeActive = !plan.frontloadFee.durationMonths || monthsElapsed < plan.frontloadFee.durationMonths;
        if (isFeeActive) {
            if (plan.frontloadFee.percentOfContribution) {
                frontFeeThisMonth = add(frontFeeThisMonth, mul(dec(monthlyContribution), dec(plan.frontloadFee.percentOfContribution)));
            }
            if (plan.frontloadFee.fixedPerMonthEUR) {
                frontFeeThisMonth = add(frontFeeThisMonth, dec(plan.frontloadFee.fixedPerMonthEUR));
            }
        }
    }
    
    const cashToInvest = sub(dec(monthlyContribution), frontFeeThisMonth);

    const contribThisMonth: Record<string, Big> = {};
    for (const comp of components) contribThisMonth[comp.id] = dec(0);

    if (allocationMode === 'rebalance' && preValue.gt(0)) {
      const needs = components.map(c => {
        const currentWeight = preValue.gt(0) ? div(preValuePositions.find(p => p.symbol === c.ticker)!.valueEUR, preValue) : dec(0);
        return { id: c.id, need: sub(dec(c.targetWeight), currentWeight) };
      });

      const positiveNeeds = needs.filter(n => n.need.gt(0));
      const totalPositiveNeed = positiveNeeds.reduce((sum, n) => add(sum, n.need), dec(0));

      if (totalPositiveNeed.gt(EPS)) {
        positiveNeeds.forEach(n => {
          const allocShare = div(n.need, totalPositiveNeed);
          const cashForSymbol = mul(cashToInvest, allocShare);
          contribThisMonth[n.id] = add(contribThisMonth[n.id], cashForSymbol);
          const priceNow = priceNowByEtf[n.id];
          if (priceNow.gt(0)) {
            const buyUnits = div(cashForSymbol, priceNow);
            unitsByEtf[n.id] = add(unitsByEtf[n.id], buyUnits);
          }
        });
      } else {
        components.forEach(c => {
          const allocShare = dec(c.targetWeight);
          const cashForSymbol = mul(cashToInvest, allocShare);
          contribThisMonth[c.id] = add(contribThisMonth[c.id], cashForSymbol);
          const priceNow = priceNowByEtf[c.id];
          if (priceNow.gt(0)) {
            const buyUnits = div(cashForSymbol, priceNow);
            unitsByEtf[c.id] = add(unitsByEtf[c.id], buyUnits);
          }
        });
      }
    } else {
      components.forEach(c => {
        const cashForSymbol = mul(cashToInvest, dec(c.targetWeight));
        contribThisMonth[c.id] = add(contribThisMonth[c.id], cashForSymbol);
        const priceNow = priceNowByEtf[c.id];
        if (priceNow.gt(0)) {
            const buyUnits = div(cashForSymbol, priceNow);
            unitsByEtf[c.id] = add(unitsByEtf[c.id], buyUnits);
        }
      });
    }

    for (const comp of components) {
      cumContribByEtf[comp.id] = add(cumContribByEtf[comp.id], contribThisMonth[comp.id]);
    }
    
    let portfolioValue = dec(0);
    const perEtfSnapshots: any[] = [];
    const driftPositions: PlanRowDrift['positions'] = [];

    for (const comp of components) {
      const id = comp.id;
      const unitsStart = unitsStartByEtf[id];
      const unitsEnd = unitsByEtf[id];
      const pricePrev = prevPriceByEtf[id];
      const priceNow = priceNowByEtf[id];
      const valueNow = mul(unitsEnd, priceNow);

      portfolioValue = add(portfolioValue, valueNow);

      let monthlyReturnPct: Big | undefined;
      let monthlyPnL: Big | undefined;

      if (pricePrev && pricePrev.gt(0)) {
        monthlyReturnPct = sub(div(priceNow, pricePrev), dec(1));
        monthlyPnL = mul(unitsStart, sub(priceNow, pricePrev));
      }
      
      const cumulativePnL = sub(valueNow, cumContribByEtf[id]);

      perEtfSnapshots.push({
        etfId: id,
        name: comp.name,
        symbol: comp.ticker,
        unitsStart: unitsStart.toFixed(),
        unitsEnd: unitsEnd.toFixed(),
        pricePrev: pricePrev ? pricePrev.toFixed() : undefined,
        priceNow: priceNow.toFixed(),
        valueNow: valueNow.toFixed(),
        contribThisMonth: contribThisMonth[id].toFixed(),
        cumulativeContrib: cumContribByEtf[id].toFixed(),
        monthlyReturnPct: monthlyReturnPct ? monthlyReturnPct.toFixed() : undefined,
        monthlyPnL: monthlyPnL ? monthlyPnL.toFixed() : undefined,
        cumulativePnL: cumulativePnL.toFixed(),
      });

      prevPriceByEtf[id] = priceNow;
    }
    
    perEtfSnapshots.forEach(snap => {
        const valueEUR = dec(snap.valueNow);
        const actualWeight = portfolioValue.gt(0) ? div(valueEUR, portfolioValue) : dec(0);
        const comp = components.find(c => c.id === snap.etfId)!;
        const p = monthlyByMonth[comp.ticker]?.[monthKey]!;
        const fxRate = p.currency === 'EUR' ? 1 : (fxByMonth[monthKey]?.rates?.[p.currency] ?? null);
        
        driftPositions.push({
            symbol: comp.ticker,
            units: toNum(unitsByEtf[comp.id], 8),
            priceCCY: p.close,
            ccy: p.currency,
            fxEURtoCCY: fxRate ?? undefined,
            priceEUR: toNum(priceNowByEtf[comp.id]),
            valueEUR: toNum(valueEUR),
            targetWeight: comp.targetWeight,
            driftPct: toNum(sub(actualWeight, dec(comp.targetWeight)), 4),
        });
    });

    performanceRows.push({
      dateKey: monthKey,
      totalValue: portfolioValue.toFixed(),
      totalContributionToDate: Object.values(cumContribByEtf).reduce((a, b) => add(a, b), dec(0)).toFixed(),
      perEtf: perEtfSnapshots,
    });
    
    const totalFeeThisMonth = add(adminFeeThisMonth, frontFeeThisMonth);

    driftRows.push({
      date: format(endOfMonth(parseISO(`${monthKey}-15`)), 'yyyy-MM-dd'),
      contribution: monthlyContribution,
      fees: toNum(totalFeeThisMonth),
      portfolioValue: toNum(portfolioValue),
      positions: driftPositions.sort((a,b) => b.valueEUR - a.valueEUR),
    });

    monthsElapsed++;
  }
  
  return {
    performance: performanceRows.filter(r => r.dateKey >= planStartMonth),
    drift: driftRows.filter(r => r.date.slice(0,7) >= planStartMonth),
  };
}
