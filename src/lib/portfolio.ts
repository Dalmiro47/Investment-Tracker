
import type { Investment, Transaction, YearFilter } from '@/lib/types';
import { dec, add, sub, mul, div, toNum } from '@/lib/money';

export interface PositionMetrics {
  buyQty: number;
  buyPrice: number;
  soldQtyAll: number;
  availableQty: number;
  purchaseValue: number;
  marketValue: number;
  realizedPLAll: number;
  realizedPLYear: number;
  unrealizedPL: number;
  realizedPLDisplay: number;
  totalPLDisplay: number;
  performancePct: number;
  type: string;
  hasSellsInYear: boolean;
}

export function calculatePositionMetrics(
  inv: Investment,
  txs: Transaction[],
  currentPrice: number | null,
  filter: YearFilter
): PositionMetrics {
  
  const zeroMetrics: Omit<PositionMetrics, 'type'> = {
    buyQty: 0, buyPrice: 0, soldQtyAll: 0, availableQty: 0, purchaseValue: 0, marketValue: 0,
    realizedPLAll: 0, realizedPLYear: 0, unrealizedPL: 0, realizedPLDisplay: 0, totalPLDisplay: 0, performancePct: 0, hasSellsInYear: false
  };

  if (!inv.purchaseQuantity || inv.purchaseQuantity <= 0) {
    return { ...zeroMetrics, type: inv.type };
  }

  const buyQty = dec(inv.purchaseQuantity);
  const buyPrice = dec(inv.purchasePricePerUnit);
  const purchaseValue = mul(buyQty, buyPrice);

  const sells = txs.filter(t => t.type === 'Sell');
  
  const soldQtyAll = sells.reduce((sum, t) => add(sum, dec(t.quantity)), dec(0));
  const realizedProceedsAll = sells.reduce((sum, t) => add(sum, dec(t.totalAmount)), dec(0));
  // If soldQty > buyQty (bad data), use min(soldQty, buyQty) for cost in realized P/L.
  const sellCostBasisAll = mul(soldQtyAll.gt(buyQty) ? buyQty : soldQtyAll, buyPrice);
  const realizedPLAll = sub(realizedProceedsAll, sellCostBasisAll);
  
  let realizedPLYear = dec(0);
  let hasSellsInYear = false;
  if (filter.kind === 'year') {
    const sellsInYear = sells.filter(t => new Date(t.date).getFullYear() === filter.year);
    if (sellsInYear.length > 0) {
        hasSellsInYear = true;
        const soldQtyYear = sellsInYear.reduce((sum, t) => add(sum, dec(t.quantity)), dec(0));
        const realizedProceedsYear = sellsInYear.reduce((sum, t) => add(sum, dec(t.totalAmount)), dec(0));
        const sellCostBasisYear = mul(soldQtyYear, buyPrice);
        realizedPLYear = sub(realizedProceedsYear, sellCostBasisYear);
    }
  }

  const availableQty = buyQty.sub(soldQtyAll).gt(0) ? buyQty.sub(soldQtyAll) : dec(0);
  const costBasis = mul(availableQty, buyPrice);
  const marketValue = mul(availableQty, dec(currentPrice ?? 0));
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
    realizedPLDisplay: toNum(realizedPLDisplay),
    totalPLDisplay: toNum(totalPLDisplay),
    performancePct: toNum(performancePct, 4),
    type: inv.type,
    hasSellsInYear: hasSellsInYear,
  };
}

export interface SummaryRow {
  type: string;
  costBasis: number;
  marketValue: number;
  realizedPL: number;
  unrealizedPL: number;
  totalPL: number;
  performancePct: number;
  economicValue: number;
}

export interface SummaryResult {
  rows: SummaryRow[];
  totals: Omit<SummaryRow, 'type' | 'economicValue'> & { economicValue: number };
}

export function aggregateByType(
  investments: Investment[],
  transactionsMap: Record<string, Transaction[]>,
  filter: YearFilter
): SummaryResult {
  let metricsPerInvestment: PositionMetrics[] = [];

    if (filter.kind === 'year') {
        const investmentsWithSellsInYear = new Set<string>();
        Object.entries(transactionsMap).forEach(([invId, txs]) => {
            const hasSellInYear = txs.some(
                tx => tx.type === 'Sell' && new Date(tx.date).getFullYear() === filter.year
            );
            if (hasSellInYear) investmentsWithSellsInYear.add(invId);
        });

        const isActive = (inv: Investment, txs: Transaction[]) => {
            const soldQty = txs.filter(t => t.type === 'Sell').reduce((sum, t) => sum + t.quantity, 0);
            return (inv.purchaseQuantity ?? 0) > soldQty;
        };

        let include: (inv: Investment) => boolean;

        switch (filter.mode) {
            case 'realized':
                include = (inv) => investmentsWithSellsInYear.has(inv.id);
                break;
            case 'holdings':
                include = (inv) => isActive(inv, transactionsMap[inv.id] ?? []);
                break;
            case 'combined':
            default:
                include = (inv) => investmentsWithSellsInYear.has(inv.id) || isActive(inv, transactionsMap[inv.id] ?? []);
                break;
        }

        metricsPerInvestment = investments
            .filter(include)
            .map(inv => {
                const txs = transactionsMap[inv.id] ?? [];
                return calculatePositionMetrics(inv, txs, inv.currentValue, filter);
            });
    } else {
        // 'all' kind
        metricsPerInvestment = investments
            .map(inv => {
                if (!inv.purchaseQuantity || inv.purchaseQuantity <= 0) return null;
                const txs = transactionsMap[inv.id] ?? [];
                return calculatePositionMetrics(inv, txs, inv.currentValue, filter);
            })
            .filter((p): p is PositionMetrics => p !== null);
    }


  const byType: Record<string, any> = {};

  metricsPerInvestment.forEach(p => {
    if (!byType[p.type]) {
      byType[p.type] = {
        type: p.type,
        costBasis: dec(0),
        marketValue: dec(0),
        realizedPL: dec(0),
        unrealizedPL: dec(0),
        totalPL: dec(0),
        purchaseValue: dec(0),
        economicValue: dec(0),
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
  
  const rows: SummaryRow[] = Object.values(byType).map(t => ({
    type: t.type,
    costBasis: toNum(t.costBasis),
    marketValue: toNum(t.marketValue),
    realizedPL: toNum(t.realizedPL),
    unrealizedPL: toNum(t.unrealizedPL),
    totalPL: toNum(t.totalPL),
    performancePct: toNum(t.purchaseValue.gt(0) ? div(t.totalPL, t.purchaseValue) : dec(0), 4),
    economicValue: toNum(add(t.marketValue, t.realizedPL)),
  }));

  const totals = rows.reduce((acc, row) => ({
    costBasis: acc.costBasis + row.costBasis,
    marketValue: acc.marketValue + row.marketValue,
    realizedPL: acc.realizedPL + row.realizedPL,
    unrealizedPL: acc.unrealizedPL + row.unrealizedPL,
    totalPL: acc.totalPL + row.totalPL,
    economicValue: acc.economicValue + row.economicValue,
    purchaseValue: acc.purchaseValue + (byType[row.type].purchaseValue ? toNum(byType[row.type].purchaseValue) : 0),
  }), { 
      costBasis: 0, marketValue: 0, realizedPL: 0, unrealizedPL: 0, totalPL: 0, 
      economicValue: 0, purchaseValue: 0, performancePct: 0 
  });
  
  const finalTotals = {
      ...totals,
      performancePct: totals.purchaseValue > 0 ? totals.totalPL / totals.purchaseValue : 0
  }
  
  delete (finalTotals as any).purchaseValue;

  return { rows, totals: finalTotals };
}
