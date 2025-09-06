
import type { Investment, Transaction, YearFilter, TaxSettings, EtfSimSummary } from '@/lib/types';
import { dec, add, sub, mul, div, toNum } from '@/lib/money';
import { isCryptoSellTaxFree, calcCapitalTax, calcCryptoTax, CapitalTaxResult, CryptoTaxResult } from './tax';
import { differenceInDays, parseISO, endOfYear } from 'date-fns';
import { computeSavings } from '@/lib/savings';
import type { SavingsRateChange } from '@/lib/types-savings';


export interface PositionMetrics {
  // Base metrics
  buyQty: number;
  buyPrice: number;
  soldQtyAll: number;
  availableQty: number;
  purchaseValue: number; // The full original cost, does not decrease with sells
  marketValue: number;
  
  // P&L Metrics
  realizedPLAll: number;
  realizedPLYear: number;
  unrealizedPL: number;
  
  // Tax-specific metrics for the filtered year
  shortTermCryptoGainYear: number;
  capitalGainsYear: number; // Realized P/L from stocks, etfs, bonds
  dividendsYear: number;
  interestYear: number;

  // Display-centric metrics
  realizedPLDisplay: number; // P/L to show based on filter (all or year)
  totalPLDisplay: number; // unrealized + realizedPLDisplay
  performancePct: number; // totalPLDisplay / purchaseValue
  
  type: Investment['type'];
}

export type AggregatedSymbolRow = {
  key: string;
  name: string;
  ticker?: string | null;
  type: Investment['type'];
  positions: number;

  buyQty: number;
  availableQty: number;
  costBasis: number;
  marketValue: number;

  realizedPL: number;
  unrealizedPL: number;
  totalPL: number;
  performancePct: number;

  economicValue: number; // marketValue + realizedPL (what donuts use)
  percentPortfolio?: number;
};


export function calculatePositionMetrics(
  inv: Investment,
  txs: Transaction[],
  filter: YearFilter,
  rates?: SavingsRateChange[]
): PositionMetrics {
  
  const zeroMetrics: Omit<PositionMetrics, 'type'> = {
    buyQty: 0, buyPrice: 0, soldQtyAll: 0, availableQty: 0, purchaseValue: 0, marketValue: 0,
    realizedPLAll: 0, realizedPLYear: 0, unrealizedPL: 0, shortTermCryptoGainYear: 0,
    capitalGainsYear: 0, dividendsYear: 0, interestYear: 0,
    realizedPLDisplay: 0, totalPLDisplay: 0, performancePct: 0
  };

  if (inv.type === 'Interest Account') {
    const savingsTx = txs
      .filter(t => t.type === 'Deposit' || t.type === 'Withdrawal')
      .map(t => ({
        date: t.date.slice(0,10),
        amount: t.totalAmount,
      }));
    const result = computeSavings({
      transactions: savingsTx,
      rates: rates ?? [{ from: inv.purchaseDate.slice(0,10), annualRatePct: 0 }],
      valuationDate: new Date().toISOString().slice(0,10),
    });

    const purchaseValue = result.netDeposits;
    const marketValue   = result.finalBalance;
    const unrealizedPL  = result.totalInterest;
    const realizedPLAll = 0;

    const yrInterest = filter.kind === 'year' ? (result.byYearInterest[String(filter.year)] ?? 0) : 0;

    const totalPLDisplay = unrealizedPL;
    const performancePct = purchaseValue > 0 ? totalPLDisplay / purchaseValue : 0;

    return {
      buyQty: 0, buyPrice: 0, soldQtyAll: 0, availableQty: 0,
      purchaseValue, marketValue,
      realizedPLAll, realizedPLYear: 0, unrealizedPL,
      shortTermCryptoGainYear: 0, capitalGainsYear: 0,
      dividendsYear: 0, interestYear: yrInterest,
      realizedPLDisplay: 0, totalPLDisplay, performancePct,
      type: inv.type,
    };
  }

  if (!inv.purchaseQuantity || inv.purchaseQuantity <= 0) {
    return { ...zeroMetrics, type: inv.type };
  }

  const buyQty = dec(inv.purchaseQuantity);
  const buyPrice = dec(inv.purchasePricePerUnit);
  const purchaseValue = mul(buyQty, buyPrice); // Full original cost

  const sells = txs.filter(t => t.type === 'Sell');
  
  const soldQtyAll = sells.reduce((sum, t) => add(sum, dec(t.quantity)), dec(0));
  const realizedProceedsAll = sells.reduce((sum, t) => add(sum, dec(t.totalAmount)), dec(0));
  const sellCostBasisAll = mul(soldQtyAll.gt(buyQty) ? buyQty : soldQtyAll, buyPrice);
  const realizedPLAll = sub(realizedProceedsAll, sellCostBasisAll);
  
  let realizedPLYear = dec(0);
  let shortTermCryptoGainYear = dec(0);
  let capitalGainsYear = dec(0);
  
  const dividends = txs.filter(t => t.type === 'Dividend');
  const interests = txs.filter(t => t.type === 'Interest');

  let dividendsYear = dec(0);
  let interestYear = dec(0);

  if (filter.kind === 'year') {
    const sellsInYear = sells.filter(t => new Date(t.date).getFullYear() === filter.year);
    if (sellsInYear.length > 0) {
      const soldQtyYear = sellsInYear.reduce((sum, t) => add(sum, dec(t.quantity)), dec(0));
      const realizedProceedsYear = sellsInYear.reduce((sum, t) => add(sum, dec(t.totalAmount)), dec(0));
      const sellCostBasisYear = mul(soldQtyYear, buyPrice);
      realizedPLYear = sub(realizedProceedsYear, sellCostBasisYear);
    }
    
    if (inv.type === 'Crypto') {
      sellsInYear.forEach(sell => {
        const pDate = parseISO(inv.purchaseDate);
        const sDate = parseISO(sell.date);
        const holdingDays = differenceInDays(sDate, pDate);
        
        if (holdingDays < 365) {
            const gainOnThisSell = mul(dec(sell.quantity), sub(dec(sell.pricePerUnit), buyPrice));
            if (gainOnThisSell.gt(0)) {
              shortTermCryptoGainYear = add(shortTermCryptoGainYear, gainOnThisSell);
            }
        }
      });
    } else {
        // Stocks, ETFs, Bonds are capital gains
        capitalGainsYear = realizedPLYear;
    }

    dividendsYear = dividends
      .filter(t => new Date(t.date).getFullYear() === filter.year)
      .reduce((sum, t) => add(sum, dec(t.totalAmount)), dec(0));

    interestYear = interests
      .filter(t => new Date(t.date).getFullYear() === filter.year)
      .reduce((sum, t) => add(sum, dec(t.totalAmount)), dec(0));
  }

  const availableQty = buyQty.sub(soldQtyAll).gt(0) ? buyQty.sub(soldQtyAll) : dec(0);
  const costBasis = mul(availableQty, buyPrice); // Cost of remaining shares
  const marketValue = mul(availableQty, dec(inv.currentValue ?? 0));
  const unrealizedPL = sub(marketValue, costBasis);

  let realizedPLDisplay = realizedPLAll;
  if (filter.kind === 'year') {
      if (filter.mode === 'realized' || filter.mode === 'combined') {
          realizedPLDisplay = realizedPLYear;
      } else if (filter.mode === 'holdings') {
          realizedPLDisplay = dec(0);
      }
  }

  const totalPLDisplay = add(realizedPLDisplay, unrealizedPL);
  const performancePct = purchaseValue.gt(0) ? div(totalPLDisplay, purchaseValue) : dec(0);

  return {
    buyQty: toNum(buyQty, 8),
    buyPrice: toNum(buyPrice),
    soldQtyAll: toNum(soldQtyAll, 8),
    availableQty: toNum(availableQty, 8),
    purchaseValue: toNum(purchaseValue),
    marketValue: toNum(marketValue),
    realizedPLAll: toNum(realizedPLAll),
    realizedPLYear: toNum(realizedPLYear),
    unrealizedPL: toNum(unrealizedPL),
    shortTermCryptoGainYear: toNum(shortTermCryptoGainYear),
    capitalGainsYear: toNum(capitalGainsYear),
    dividendsYear: toNum(dividendsYear),
    interestYear: toNum(interestYear),
    realizedPLDisplay: toNum(realizedPLDisplay),
    totalPLDisplay: toNum(totalPLDisplay),
    performancePct: toNum(performancePct, 4),
    type: inv.type,
  };
}

export function aggregateBySymbol(
  investments: Investment[],
  transactionsMap: Record<string, Transaction[]>,
  filter: YearFilter
): { rows: AggregatedSymbolRow[]; totals: { economicValue: number } } {
  type Acc = AggregatedSymbolRow & { purchaseValue: number };
  const byKey = new Map<string, Acc>();

  const keyOf = (inv: Investment) =>
    `${inv.type}:${(inv.ticker || inv.name).toLowerCase()}`;

  for (const inv of investments) {
    const metrics = calculatePositionMetrics(inv, transactionsMap[inv.id] ?? [], filter);
    const key = keyOf(inv);

    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        name: inv.name,
        ticker: inv.ticker ?? null,
        type: inv.type,
        positions: 0,

        buyQty: 0,
        availableQty: 0,
        costBasis: 0,
        marketValue: 0,

        realizedPL: 0,
        unrealizedPL: 0,
        totalPL: 0,
        performancePct: 0,

        economicValue: 0,
        percentPortfolio: 0,

        // internal for perf calc
        purchaseValue: 0,
      });
    }

    const a = byKey.get(key)!;
    a.positions += 1;
    a.buyQty += metrics.buyQty;
    a.availableQty += metrics.availableQty;

    // cost basis of remaining shares for this lot = availableQty * buyPrice
    a.costBasis += metrics.availableQty * metrics.buyPrice;

    a.marketValue += metrics.marketValue;
    a.realizedPL += metrics.realizedPLDisplay;
    a.unrealizedPL += metrics.unrealizedPL;
    a.totalPL += metrics.totalPLDisplay;
    a.economicValue += metrics.marketValue + metrics.realizedPLDisplay;

    a.purchaseValue += metrics.purchaseValue;
  }

  const rows: AggregatedSymbolRow[] = Array.from(byKey.values()).map((a) => ({
    ...a,
    performancePct: a.purchaseValue > 0 ? a.totalPL / a.purchaseValue : 0,
  }));

  const totalEconomic = rows.reduce((s, r) => s + r.economicValue, 0);
  rows.forEach((r) => {
    r.percentPortfolio = totalEconomic > 0 ? r.economicValue / totalEconomic : 0;
  });

  // Sort by economic value desc by default
  rows.sort((a, b) => b.economicValue - a.economicValue);

  return { rows, totals: { economicValue: totalEconomic } };
}


export interface YearTaxSummary {
  capitalTaxResult: CapitalTaxResult;
  cryptoTaxResult: CryptoTaxResult;
  grandTotal: number;
  totalShortTermGains: number;
}


export interface AggregatedSummary {
  rows: {
    type: Investment['type'];
    costBasis: number;
    marketValue: number;
    realizedPL: number;
    unrealizedPL: number;
    totalPL: number;
    performancePct: number;
    economicValue: number;
  }[];
  totals: {
    costBasis: number;
    marketValue: number;
    realizedPL: number;
    unrealizedPL: number;
    totalPL: number;
    performancePct: number;
    economicValue: number;
  };
  taxSummary: YearTaxSummary | null;
}

function getEtfMetrics(etfSummaries: EtfSimSummary[], filter: YearFilter): {
  costBasis: number, marketValue: number, realizedPL: number, unrealizedPL: number
} {
  let costBasis = 0;
  let marketValue = 0;
  let unrealizedPL = 0;
  const realizedPL = 0; // ETFs are buy-and-hold, no realized P/L in this model

  if (filter.kind === 'all') {
      etfSummaries.forEach(s => {
          costBasis += s.lifetime.contrib;
          marketValue += s.lifetime.marketValue;
          unrealizedPL += s.lifetime.unrealizedPL;
      });
  } else {
      etfSummaries.forEach(s => {
          const yearData = s.byYear[filter.year];
          if (yearData) {
              costBasis += yearData.contrib; // Cost basis for the year is the contribution for that year
              marketValue += yearData.endValue;
              unrealizedPL += yearData.unrealizedPL; // Use the lifetime P/L up to that year's end for a consistent view
          }
      });
  }
  return { costBasis, marketValue, realizedPL, unrealizedPL };
}

export function aggregateByType(
  investments: Investment[],
  transactionsMap: Record<string, Transaction[]>,
  etfSummaries: EtfSimSummary[],
  filter: YearFilter,
  taxSettings: TaxSettings | null,
  rateSchedulesMap: Record<string, SavingsRateChange[]>
): AggregatedSummary {
    let metricsPerInvestment: PositionMetrics[] = [];
    
    // Step 1: Filter investments based on the selected view mode
    if (filter.kind === 'year') {
        const investmentsWithSellsInYear = new Set<string>();
        Object.entries(transactionsMap).forEach(([invId, txs]) => {
            if (txs.some(tx => tx.type === 'Sell' && new Date(tx.date).getFullYear() === filter.year)) {
                investmentsWithSellsInYear.add(invId);
            }
        });

        // active today?
        const isActiveToday = (inv: Investment) => (inv.purchaseQuantity ?? 0) > (inv.totalSoldQty ?? 0) || inv.type === 'Interest Account';

        // existed by the end of the selected year?
        const existedByYearEnd = (inv: Investment, year: number) => {
          const p = parseISO(inv.purchaseDate);
          // use UTC end-of-year to avoid TZ skews
          const eoy = endOfYear(new Date(Date.UTC(year, 0, 1)));
          return p.getTime() <= eoy.getTime();
        };

        let include: (inv: Investment) => boolean;
        switch (filter.mode) {
          case 'realized':
            // only assets with sells in that year
            include = (inv) => investmentsWithSellsInYear.has(inv.id);
            break;

          case 'holdings':
            // open positions that already existed by year end
            include = (inv) => isActiveToday(inv) && existedByYearEnd(inv, filter.year);
            break;

          case 'combined':
          default:
            // union of realized for that year + holdings that existed by year end
            include = (inv) =>
              investmentsWithSellsInYear.has(inv.id) ||
              (isActiveToday(inv) && existedByYearEnd(inv, filter.year));
            break;
        }

        metricsPerInvestment = investments
            .filter(include)
            .map(inv => calculatePositionMetrics(inv, transactionsMap[inv.id] ?? [], filter, rateSchedulesMap[inv.id]));
    } else {
        metricsPerInvestment = investments
            .map(inv => calculatePositionMetrics(inv, transactionsMap[inv.id] ?? [], filter, rateSchedulesMap[inv.id]))
            .filter(p => p.purchaseValue > 0 || p.type === 'Interest Account');
    }
    
    // Step 2: Aggregate financial metrics by type for manual investments
    const byType: Record<string, any> = {};
    metricsPerInvestment.forEach(p => {
        if (!byType[p.type]) {
            byType[p.type] = {
                type: p.type, costBasis: dec(0), marketValue: dec(0),
                realizedPL: dec(0), unrealizedPL: dec(0), totalPL: dec(0),
                purchaseValue: dec(0),
            };
        }
        const t = byType[p.type];
        t.costBasis = add(t.costBasis, mul(dec(p.availableQty), dec(p.buyPrice)));
        t.marketValue = add(t.marketValue, dec(p.marketValue));
        t.realizedPL = add(t.realizedPL, dec(p.realizedPLDisplay));
        t.unrealizedPL = add(t.unrealizedPL, dec(p.unrealizedPL));
        t.totalPL = add(t.totalPL, dec(p.totalPLDisplay));
        t.purchaseValue = add(t.purchaseValue, dec(p.purchaseValue));
    });

    const rows = Object.values(byType).map(t => ({
        type: t.type,
        costBasis: toNum(t.costBasis),
        marketValue: toNum(t.marketValue),
        realizedPL: toNum(t.realizedPL),
        unrealizedPL: toNum(t.unrealizedPL),
        totalPL: toNum(t.totalPL),
        performancePct: toNum(t.purchaseValue.gt(0) ? div(t.totalPL, t.purchaseValue) : dec(0), 4),
        economicValue: toNum(add(t.marketValue, t.realizedPL)),
    }));

    // Step 3: Add aggregated ETF data as a new row
    if (etfSummaries.length > 0) {
      const etfMetrics = getEtfMetrics(etfSummaries, filter);
      if (etfMetrics.costBasis > 0 || etfMetrics.marketValue > 0) {
        const totalPL = etfMetrics.realizedPL + etfMetrics.unrealizedPL;
        rows.push({
            type: 'ETF',
            costBasis: etfMetrics.costBasis,
            marketValue: etfMetrics.marketValue,
            realizedPL: etfMetrics.realizedPL,
            unrealizedPL: etfMetrics.unrealizedPL,
            totalPL: totalPL,
            performancePct: etfMetrics.costBasis > 0 ? totalPL / etfMetrics.costBasis : 0,
            economicValue: etfMetrics.marketValue + etfMetrics.realizedPL,
        });
      }
    }
    
    // Step 4: Calculate final totals
    const totals = rows.reduce((acc, row) => {
        acc.costBasis += row.costBasis;
        acc.marketValue += row.marketValue;
        acc.realizedPL += row.realizedPL;
        acc.unrealizedPL += row.unrealizedPL;
        acc.totalPL += row.totalPL;
        const typeSummary = byType[row.type];
        if(typeSummary) {
          acc.purchaseValue = add(acc.purchaseValue, typeSummary.purchaseValue);
        } else if (row.type === 'ETF') {
          // For ETFs, the "purchase value" for performance calculation is just the cost basis (total contributions)
          acc.purchaseValue = add(acc.purchaseValue, dec(row.costBasis));
        }
        return acc;
    }, { costBasis: 0, marketValue: 0, realizedPL: 0, unrealizedPL: 0, totalPL: 0, purchaseValue: dec(0) });

    const finalTotals = {
        costBasis: totals.costBasis,
        marketValue: totals.marketValue,
        realizedPL: totals.realizedPL,
        unrealizedPL: totals.unrealizedPL,
        totalPL: totals.totalPL,
        performancePct: totals.purchaseValue.gt(0) ? totals.totalPL / toNum(totals.purchaseValue) : 0,
        economicValue: totals.marketValue + totals.realizedPL,
    };
    
    // Step 5: Calculate tax summary if applicable
    let taxSummary: YearTaxSummary | null = null;
    if (filter.kind === 'year' && taxSettings) {
        const capitalIncome = metricsPerInvestment
            .reduce((sum, p) => sum + p.capitalGainsYear + p.dividendsYear + p.interestYear, 0);

        const shortTermCryptoGains = metricsPerInvestment
            .reduce((sum, p) => sum + p.shortTermCryptoGainYear, 0);
            
        const capitalTaxResult = calcCapitalTax({
            year: filter.year,
            filing: taxSettings.filingStatus,
            churchRate: taxSettings.churchTaxRate,
            capitalIncome: capitalIncome
        });
        
        const cryptoTaxResult = calcCryptoTax({
            year: filter.year,
            marginalRate: taxSettings.cryptoMarginalRate,
            churchRate: taxSettings.churchTaxRate,
            shortTermGains: shortTermCryptoGains
        });

        taxSummary = {
            capitalTaxResult,
            cryptoTaxResult,
            grandTotal: capitalTaxResult.total + cryptoTaxResult.total,
            totalShortTermGains: shortTermCryptoGains,
        };
    }

    return { rows, totals: finalTotals, taxSummary };
}
