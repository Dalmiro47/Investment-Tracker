
import type { Investment, Transaction, InvestmentType } from '@/lib/types';
import { dec, add, sub, mul, div, toNum } from '@/lib/money';

export interface PositionMetrics {
  buyQty: number;
  buyPrice: number;
  soldQty: number;
  availableQty: number;
  purchaseValue: number;
  costBasis: number;
  marketValue: number;
  realizedProceeds: number;
  realizedPL: number;
  unrealizedPL: number;
  totalPL: number;
  performancePct: number;
  type: string;
}

export function calculatePositionMetrics(
  inv: Investment,
  txs: Transaction[],
  currentPrice: number | null
): PositionMetrics {

  const buyQty = dec(inv.purchaseQuantity);
  const buyPrice = dec(inv.purchasePricePerUnit);
  
  const sells = txs.filter(t => t.type === 'Sell');
  const soldQty = sells.reduce((sum, t) => add(sum, dec(t.quantity)), dec(0));
  
  const availableQty = buyQty.gt(soldQty) ? sub(buyQty, soldQty) : dec(0);

  const purchaseValue = mul(buyQty, buyPrice);
  const costBasis = mul(availableQty, buyPrice);
  
  const marketValue = mul(availableQty, dec(currentPrice ?? 0));

  const realizedProceeds = sells.reduce((sum, t) => add(sum, dec(t.totalAmount)), dec(0));
  
  const sellCostBasis = mul(buyQty.lt(soldQty) ? buyQty : soldQty, buyPrice);
  const realizedPL = sub(realizedProceeds, sellCostBasis);
  
  const unrealizedPL = sub(marketValue, costBasis);
  
  const totalPL = add(realizedPL, unrealizedPL);
  
  const performancePct = purchaseValue.gt(0) ? div(totalPL, purchaseValue) : dec(0);

  return {
    buyQty: toNum(buyQty, 8),
    buyPrice: toNum(buyPrice),
    soldQty: toNum(soldQty, 8),
    availableQty: toNum(availableQty, 8),
    purchaseValue: toNum(purchaseValue),
    costBasis: toNum(costBasis),
    marketValue: toNum(marketValue),
    realizedProceeds: toNum(realizedProceeds),
    realizedPL: toNum(realizedPL),
    unrealizedPL: toNum(unrealizedPL),
    totalPL: toNum(totalPL),
    performancePct: toNum(performancePct, 4),
    type: inv.type,
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
  totals: Omit<SummaryRow, 'type'>;
}

export function aggregateByType(
  investments: Investment[],
  transactionsMap: Record<string, Transaction[]>
): SummaryResult {
  const metricsPerInvestment: PositionMetrics[] = investments
    .map(inv => {
      // For now, we assume a single purchase transaction is embedded in the investment data itself.
      // A more robust solution might find the earliest "Buy" tx if they were stored separately.
      if (!inv.purchaseQuantity || inv.purchaseQuantity <= 0) return null;
      
      const txs = transactionsMap[inv.id] ?? [];
      return calculatePositionMetrics(inv, txs, inv.currentValue);
    })
    .filter((p): p is PositionMetrics => p !== null);

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
        purchaseValue: dec(0), // for perf calculation
      };
    }
    
    const t = byType[p.type];
    t.costBasis = add(t.costBasis, dec(p.costBasis));
    t.marketValue = add(t.marketValue, dec(p.marketValue));
    t.realizedPL = add(t.realizedPL, dec(p.realizedPL));
    t.unrealizedPL = add(t.unrealizedPL, dec(p.unrealizedPL));
    t.totalPL = add(t.totalPL, dec(p.totalPL));
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
    // temp values for final calculation
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
