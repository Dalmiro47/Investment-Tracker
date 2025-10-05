

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
    if (monthKey < planStartMonth) continue;

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

    // ----- 1) Accrue fixed fees this month (do NOT deduct yet) -----
    if (adminFixedPerMonth > 0) adminYtdFixed += adminFixedPerMonth;

    if (frontFixedPerMonth > 0 && (frontDuration === 0 || frontMonthsUsed < frontDuration)) {
      frontYtdFixed += frontFixedPerMonth;
      frontMonthsUsed += 1;
    }

    const preValue = components.reduce(
      (s, c) => add(s, mul(unitsByEtf[c.id], priceNowByEtf[c.id] ?? dec(0))),
      dec(0)
    );
    
    let plannedContribution = dec(getContributionForMonth(plan, monthKey));
    if (monthKey < planStartMonth) plannedContribution = dec(0);

    let cashToInvest = plannedContribution;
    if (cashToInvest.lt(0)) cashToInvest = dec(0);

    const contribThisMonth: Record<string, Big> = {};
    for (const comp of components) contribThisMonth[comp.id] = dec(0);
    
    const portfolioValueAfterAdminFee = components.reduce((s, c) => add(s, mul(unitsByEtf[c.id], priceNowByEtf[c.id] ?? dec(0))), dec(0));
    
    if (allocationMode === 'rebalance' && portfolioValueAfterAdminFee.gt(0)) {
        const needs = components.map(c => {
            const currentVal = mul(unitsByEtf[c.id], priceNowByEtf[c.id]);
            const currentWeight = portfolioValueAfterAdminFee.gt(0) ? div(currentVal, portfolioValueAfterAdminFee) : dec(0);
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
        } else { // All are at or above target, revert to target weight allocation
            components.forEach(c => {
                const allocShare = dec(c.targetWeight);
                const cashForSymbol = mul(cashToInvest, allocShare);
                contribThisMonth[c.id] = add(contribThisMonth[c.id], cashForSymbol);
                const priceNow = priceNowByEtf[c.id];
                if (priceNow.gt(0)) {
                    const buyUnits = div(cashForSymbol, priceNow);
                    unitsByEtf[n.id] = add(unitsByEtf[n.id], buyUnits);
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
                unitsByEtf[n.id] = add(unitsByEtf[n.id], buyUnits);
            }
        });
    }


    // ----- 2) If this is December OR last simulated month -> APPLY the YTD fees -----
    const isDecember = mOf(monthKey) === 12;
    const isLastMonth = monthKey === months[months.length - 1];
    let feesAppliedThisMonth = 0;

    if (isDecember || isLastMonth) {
      const ytdTotal = adminYtdFixed + frontYtdFixed;

      if (ytdTotal > 0) {
        // Sell units pro-rata to pay the ytd fees
        const valueNow = components.reduce((sum, c) => {
          const px = priceNowByEtf[c.id] ?? dec(0);
          return add(sum, mul(unitsByEtf[c.id], px));
        }, dec(0));

        // Pay from NAV up to available value
        const payFromNav = Math.min(Number(valueNow), ytdTotal);
        if (payFromNav > 0 && Number(valueNow) > 0) {
          const ratio = payFromNav / Number(valueNow); // 0..1
          for (const c of components) {
            const px = Number(priceNowByEtf[c.id] ?? dec(0));
            if (px <= 0) continue;
            const holdingVal = Number(unitsByEtf[c.id]) * px;
            const sellVal = holdingVal * ratio;
            const sellUnits = sellVal / px;
            const newUnits = Math.max(0, Number(unitsByEtf[c.id]) - sellUnits);
            (unitsByEtf as any)[c.id] = dec(newUnits);
          }
          feesAppliedThisMonth += payFromNav;
        }

        // Reset YTD buckets for the new year
        adminYtdFixed = 0;
        frontYtdFixed = 0;
      }
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
    
    const monthFees = Number(feesAppliedThisMonth);
    const nav = Number(portfolioValue);

    // --- DEBUG: assert boundary month has fees if plan has fixed fees ---
    const hasFixedFees = Number(plan.adminFee?.fixedPerMonthEUR ?? 0) > 0
      || Number(plan.frontloadFee?.fixedPerMonthEUR ?? 0) > 0;
    
    if (isBoundary && hasFixedFees && monthFees === 0) {
      console.error('[SIM][BUG] Boundary month has 0 fees', {
        monthKey, adminFixed: plan.adminFee?.fixedPerMonthEUR ?? 0,
        frontFixed: plan.frontloadFee?.fixedPerMonthEUR ?? 0
      });
    }

    driftRows.push({
      date: format(endOfMonth(parseISO(`${monthKey}-15`)), 'yyyy-MM-dd'),
      contribution: Number(plannedContribution),
      fees: monthFees,
      portfolioValue: nav,
      positions: driftPositions.sort((a,b) => b.valueEUR - a.valueEUR),
    });
  }

  const sumRowFees = driftRows.reduce((s, r) => s + (r.fees || 0), 0);
  console.log('[SIM] rows fee sum =', sumRowFees.toFixed(2));
  
  return {
    performance: performanceRows.filter(r => r.dateKey >= planStartMonth),
    drift: driftRows.filter(r => r.date.slice(0,7) >= planStartMonth),
  };
}

    