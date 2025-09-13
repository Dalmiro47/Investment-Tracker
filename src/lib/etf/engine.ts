import { endOfMonth, parseISO, format } from 'date-fns';
import type { ETFPlan, ETFComponent, ETFPricePoint, FXRatePoint, PlanRowDrift, SimulationRows, PlanRowPerformance } from '@/lib/types.etf';
import { dec, add, sub, mul, div, toNum, EPS } from '@/lib/money';
import Big from 'big.js';
import { getStartMonth } from '@/lib/date-helpers';

type PriceMap = Record<string, Record<string, ETFPricePoint>>; // symbol -> month -> point
type FXMap = Record<string, FXRatePoint>;                       // month -> point (EUR base)
type EngineOptions = { 
  allocationMode?: 'fixed' | 'rebalance';
  endMonth?: string;
};

const monthsBetween = (start: string, end: string) => {
  const out: string[] = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2,'0')}`);
    m++; if (m === 13) { m = 1; y++; }
  }
  return out;
};

export function getContributionForMonth(plan: ETFPlan, month: string): number {
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
  
  const months = monthsBetween(planStartMonth, endMonth);

  const driftRows: PlanRowDrift[] = [];
  const performanceRows: PlanRowPerformance[] = [];

  const unitsByEtf: Record<string, Big> = {};
  const cumContribByEtf: Record<string, Big> = {};
  const prevPriceByEtf: Record<string, Big | undefined> = {};

  components.forEach(c => {
    unitsByEtf[c.id] = dec(0);
    cumContribByEtf[c.id] = dec(0);
    prevPriceByEtf[c.id] = undefined;
  });

  for (const monthKey of months) {
    if (monthKey < planStartMonth) continue;

    const unitsStartByEtf: Record<string, Big> = {};
    for (const comp of components) unitsStartByEtf[comp.id] = unitsByEtf[comp.id];

    const monthlyContribution = getContributionForMonth(plan, monthKey);
    const fee = plan.feePct ? mul(dec(monthlyContribution), dec(plan.feePct)) : dec(0);
    const cashToInvest = sub(dec(monthlyContribution), fee);

    const hasAllPrices = components.every(c => monthlyByMonth[c.ticker]?.[monthKey]);
    if (!hasAllPrices) continue;

    const getBasePrice = (symbol: string, month: string) => {
      const p = monthlyByMonth[symbol]?.[month];
      if (!p) return null;
      const fxRate = p.currency === 'EUR' ? 1 : (fxByMonth[month]?.rates?.[p.currency] ?? null);
      if (p.currency !== 'EUR' && !fxRate) return null;
      return fxRate ? div(dec(p.close), dec(fxRate)) : dec(p.close);
    }
    
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
    
    driftRows.push({
      date: format(endOfMonth(parseISO(`${monthKey}-15`)), 'yyyy-MM-dd'),
      contribution: monthlyContribution,
      fees: toNum(fee),
      portfolioValue: toNum(portfolioValue),
      positions: driftPositions.sort((a,b) => b.valueEUR - a.valueEUR),
    });
  }
  
  return {
    performance: performanceRows.filter(r => r.dateKey >= planStartMonth),
    drift: driftRows.filter(r => r.date.slice(0,7) >= planStartMonth),
  };
}
