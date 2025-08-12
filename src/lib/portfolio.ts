
import type { Investment, Transaction, YearFilter, TaxSettings } from '@/lib/types';
import { dec, add, sub, mul, div, toNum } from '@/lib/money';
import { isCryptoSellTaxFree, taxCapitalIncome, taxCryptoYear, SPARER_PAUSCHBETRAG } from './tax';

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
  taxableCryptoGainYear: number;
  dividendsYear: number;
  interestYear: number;

  // Display-centric metrics
  realizedPLDisplay: number; // P/L to show based on filter (all or year)
  totalPLDisplay: number; // unrealized + realizedPLDisplay
  performancePct: number; // totalPLDisplay / purchaseValue
  
  type: Investment['type'];
}

export function calculatePositionMetrics(
  inv: Investment,
  txs: Transaction[],
  filter: YearFilter
): PositionMetrics {
  
  const zeroMetrics: Omit<PositionMetrics, 'type'> = {
    buyQty: 0, buyPrice: 0, soldQtyAll: 0, availableQty: 0, purchaseValue: 0, marketValue: 0,
    realizedPLAll: 0, realizedPLYear: 0, unrealizedPL: 0, taxableCryptoGainYear: 0,
    dividendsYear: 0, interestYear: 0, realizedPLDisplay: 0, totalPLDisplay: 0, performancePct: 0
  };

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
  let taxableCryptoGainYear = dec(0);
  
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
            const isTaxFree = isCryptoSellTaxFree(inv.purchaseDate, sell.date, inv.stakingOrLending ?? false);
            if (!isTaxFree) {
                const gainOnThisSell = mul(dec(sell.quantity), sub(dec(sell.pricePerUnit), buyPrice));
                if (gainOnThisSell.gt(0)) { // Only add gains to the taxable amount
                    taxableCryptoGainYear = add(taxableCryptoGainYear, gainOnThisSell);
                }
            }
        });
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
    taxableCryptoGainYear: toNum(taxableCryptoGainYear),
    dividendsYear: toNum(dividendsYear),
    interestYear: toNum(interestYear),
    realizedPLDisplay: toNum(realizedPLDisplay),
    totalPLDisplay: toNum(totalPLDisplay),
    performancePct: toNum(performancePct, 4),
    type: inv.type,
  };
}


export interface TaxSummary {
  capitalGains: ReturnType<typeof taxCapitalIncome>;
  crypto: ReturnType<typeof taxCryptoYear>;
  grandTotal: number;
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
  taxSummary: TaxSummary | null;
}

export function aggregateByType(
  investments: Investment[],
  transactionsMap: Record<string, Transaction[]>,
  filter: YearFilter,
  taxSettings: TaxSettings | null
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

        const isActive = (inv: Investment) => (inv.purchaseQuantity ?? 0) > (inv.totalSoldQty ?? 0);

        let include: (inv: Investment) => boolean;
        switch (filter.mode) {
            case 'realized': include = (inv) => investmentsWithSellsInYear.has(inv.id); break;
            case 'holdings': include = (inv) => isActive(inv); break;
            case 'combined': default: include = (inv) => investmentsWithSellsInYear.has(inv.id) || isActive(inv); break;
        }
        metricsPerInvestment = investments
            .filter(include)
            .map(inv => calculatePositionMetrics(inv, transactionsMap[inv.id] ?? [], filter));
    } else {
        metricsPerInvestment = investments
            .map(inv => calculatePositionMetrics(inv, transactionsMap[inv.id] ?? [], filter))
            .filter(p => p.purchaseValue > 0);
    }
    
    // Step 2: Aggregate financial metrics by type
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
    
    const totals = rows.reduce((acc, row) => {
        acc.costBasis += row.costBasis;
        acc.marketValue += row.marketValue;
        acc.realizedPL += row.realizedPL;
        acc.unrealizedPL += row.unrealizedPL;
        acc.totalPL += row.totalPL;
        acc.purchaseValue = add(acc.purchaseValue, byType[row.type].purchaseValue);
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
    
    // Step 3: Calculate tax summary if applicable
    let taxSummary: TaxSummary | null = null;
    if (filter.kind === 'year' && taxSettings) {
        const capitalGainsIncome = metricsPerInvestment
            .filter(p => p.type === 'Stock' || p.type === 'ETF')
            .reduce((sum, p) => sum + Math.max(0, p.realizedPLYear), 0);
        
        const dividendIncome = metricsPerInvestment.reduce((sum, p) => sum + p.dividendsYear, 0);
        const interestIncome = metricsPerInvestment.reduce((sum, p) => sum + p.interestYear, 0);

        const cryptoGains = metricsPerInvestment
            .filter(p => p.type === 'Crypto')
            .reduce((sum, p) => sum + p.taxableCryptoGainYear, 0);
            
        const allowance = SPARER_PAUSCHBETRAG(taxSettings.filingStatus);
        
        const capitalGainsTaxInfo = taxCapitalIncome(capitalGainsIncome, dividendIncome, interestIncome, allowance, taxSettings);
        const cryptoTaxInfo = taxCryptoYear(cryptoGains, taxSettings);

        taxSummary = {
            capitalGains: capitalGainsTaxInfo,
            crypto: cryptoTaxInfo,
            grandTotal: capitalGainsTaxInfo.totalTax + cryptoTaxInfo.totalTax,
        };
    }

    return { rows, totals: finalTotals, taxSummary };
}
