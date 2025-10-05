

import { endOfMonth, parseISO, format, addMonths as addMonthsFns, subMonths as subMonthsFns } from 'date-fns';
import type { ETFPlan, ETFComponent, ETFPricePoint, FXRatePoint, PlanRowDrift, SimulationRows, PlanRowPerformance } from '@/lib/types.etf';
import { dec, add, sub, mul, div, toNum, EPS } from '@/lib/money';
import Big from 'big.js';
import { getStartMonth } from '@/lib/date-helpers';

export const ENGINE_SCHEMA_VERSION = 3;

function ym(dateStr: string) { return dateStr.slice(0,7); }
function yOf(ymKey: string) { return Number(ymKey.slice(0,4)); }
function mOf(ymKey: string) { return Number(ymKey.slice(5,7)); } // 1..12


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
  monthlyByMonth: Record<string, Record<string, ETFPricePoint>>, 
  fxByMonth: Record<string, FXRatePoint>,         
  options: { endMonth?: string; } = {}
): SimulationRows {
  const allocationMode = plan.rebalanceOnContribution ? 'rebalance' : 'fixed';
  
  const planStartMonth = getStartMonth(plan);
  const endMonth = options.endMonth ?? new Date().toISOString().slice(0,7);
  
  const months = monthsBetweenInclusive(planStartMonth, endMonth);

  const driftRows: PlanRowDrift[] = [];
  const performanceRows: PlanRowPerformance[] = [];

  const unitsByEtf: Record<string, Big> = {};
  const cumContribByEtf: Record<string, Big> = {};
  const prevPriceByEtf: Record<string, Big | undefined> = {};

  let adminYtdFixed = 0;
  let frontYtdFixed = 0;
  let frontMonthsUsed = 0;
  const frontDuration = Number(plan.frontloadFee?.durationMonths ?? 0);
  const adminFixedPerMonth = Number(plan.adminFee?.fixedPerMonthEUR ?? 0);
  const frontFixedPerMonth = Number(plan.frontloadFee?.fixedPerMonthEUR ?? 0);
  let currentYear = yOf(planStartMonth);

  components.forEach(c => {
    unitsByEtf[c.id] = dec(0);
    cumContribByEtf[c.id] = dec(0);
    prevPriceByEtf[c.id] = undefined;

    const prevMonthDate = subMonthsFns(parseISO(`${planStartMonth}-01`), 1);
    const prevMonthStr = format(prevMonthDate, 'yyyy-MM');
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
    if (yOf(monthKey) !== currentYear) {
      currentYear = yOf(monthKey);
      adminYtdFixed = 0;
      frontYtdFixed = 0;
    }

    const unitsStartByEtf: Record<string, Big> = {};
    for (const comp of components) unitsStartByEtf[comp.id] = unitsByEtf[comp.id];

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
    
    // NAV before this month's contribution
    const preValue = components.reduce(
      (s, c) => add(s, mul(unitsByEtf[c.id], priceNowByEtf[c.id] ?? dec(0))),
      dec(0)
    );
    
    const admin = plan.adminFee ?? {};
    const adminFixed = Number(admin.fixedPerMonthEUR ?? 0);
    const annualPctRaw = Number(admin.annualPercent ?? 0);
    const annualPct = annualPctRaw > 1 ? annualPctRaw / 100 : annualPctRaw;
    const monthlyPct = admin.applyProRataMonthly === false ? 0 : (annualPct / 12);

    let adminFeeThisMonth = dec(0);
    if (monthlyPct > 0 && preValue.gt(0)) adminFeeThisMonth = add(adminFeeThisMonth, mul(preValue, dec(monthlyPct)));
    if (adminFixed > 0) adminFeeThisMonth = add(adminFeeThisMonth, dec(adminFixed));

    let adminRemainder = dec(0);
    if (adminFeeThisMonth.gt(0)) {
      if (preValue.gt(0)) {
        const payFromNav = preValue.gte(adminFeeThisMonth) ? adminFeeThisMonth : preValue;
        const ratio = div(payFromNav, preValue);
        for (const c of components) {
          const id = c.id;
          const px = priceNowByEtf[id];
          if (!px || px.lte(0)) continue;
          const value = mul(unitsByEtf[id], px);
          const sellVal = mul(value, ratio);
          const sellUnits = div(sellVal, px);
          unitsByEtf[id] = unitsByEtf[id].gt(sellUnits) ? sub(unitsByEtf[id], sellUnits) : dec(0);
        }
        adminRemainder = sub(adminFeeThisMonth, payFromNav);
      } else {
        adminRemainder = adminFeeThisMonth;
      }
    }
    
    const fl = plan.frontloadFee ?? {};
    const monthsElapsed =
      (Number(monthKey.slice(0,4)) - Number(planStartMonth.slice(0,4))) * 12 +
      (Number(monthKey.slice(5,7)) - Number(planStartMonth.slice(5,7)));

    let plannedContribution = dec(getContributionForMonth(plan, monthKey));
    if (monthKey < planStartMonth) plannedContribution = dec(0);

    let contrib = plannedContribution;
    if (adminRemainder.gt(0)) {
      contrib = sub(contrib, adminRemainder);
      if (contrib.lt(0)) contrib = dec(0);
    }
    
    let frontFeeThisMonth = dec(0);
    const inWindow = fl.durationMonths == null ? true : (monthsElapsed < fl.durationMonths);
    const pctRaw = Number(fl.percentOfContribution ?? 0);
    const pct = pctRaw > 1 ? pctRaw / 100 : pctRaw;

    if (inWindow) {
      if (pct > 0) frontFeeThisMonth = add(frontFeeThisMonth, mul(contrib, dec(pct)));
      if (Number(fl.fixedPerMonthEUR ?? 0) > 0)
        frontFeeThisMonth = add(frontFeeThisMonth, dec(fl.fixedPerMonthEUR!));
    }
    
    let cashToInvest = sub(contrib, frontFeeThisMonth);
    if (cashToInvest.lt(0)) cashToInvest = dec(0);

    const contribThisMonth: Record<string, Big> = {};
    for (const comp of components) contribThisMonth[comp.id] = dec(0);
    
    const navAfterAdmin = components.reduce((s, c) => add(s, mul(unitsByEtf[c.id], priceNowByEtf[c.id] ?? dec(0))), dec(0));
    
    if (allocationMode === 'rebalance' && navAfterAdmin.gt(0)) {
        const needs = components.map(c => {
            const currentVal = mul(unitsByEtf[c.id], priceNowByEtf[c.id]);
            const currentWeight = navAfterAdmin.gt(0) ? div(currentVal, navAfterAdmin) : dec(0);
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
    } else { // Fixed allocation
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

    const perEtfSnapshots: any[] = [];
    const driftPositions: PlanRowDrift['positions'] = [];

    for (const comp of components) {
      const id = comp.id;
      const unitsStart = unitsStartByEtf[id];
      const unitsEnd = unitsByEtf[id];
      const pricePrev = prevPriceByEtf[id];
      const priceNow = priceNowByEtf[id];
      const valueNow = mul(unitsEnd, priceNow);

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
    
    const portfolioValue = components.reduce(
      (s, c) => add(s, mul(unitsByEtf[c.id], priceNowByEtf[c.id] ?? dec(0))),
      dec(0)
    );
    
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
    
    const totalFeesThisMonth = add(adminFeeThisMonth, frontFeeThisMonth);
    
    if (monthKey.endsWith('-12') || monthKey === months[months.length - 1]) {
        console.log('[SIM]', monthKey, 'monthFees=', Number(totalFeesThisMonth).toFixed(2));
    }

    driftRows.push({
      date: format(endOfMonth(parseISO(`${monthKey}-15`)), 'yyyy-MM-dd'),
      contribution: Number(plannedContribution),
      fees: Number(totalFeesThisMonth),
      portfolioValue: toNum(portfolioValue),
      positions: driftPositions.sort((a,b) => b.valueEUR - a.valueEUR),
    });
  }

  const sumRowFees = driftRows.reduce((s, r) => s + (r.fees || 0), 0);
  console.log('[SIM] rows fee sum =', sumRowFees.toFixed(2));
  
  return {
    performance: performanceRows,
    drift: driftRows,
  };
}
