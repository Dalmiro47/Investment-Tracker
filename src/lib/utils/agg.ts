
import type { Transaction } from '@/lib/types';

export type Agg = {
  buyQty: number;
  sellQty: number;
  availableQty: number;

  avgBuyPrice: number;   // weighted
  avgSellPrice: number;  // weighted

  totalCost: number;     // Σ buy.qty * buy.price
  proceeds: number;      // Σ sell.qty * sell.price

  costBasisRemaining: number; // avgBuyPrice * availableQty
  marketValue: number;        // availableQty * currentPrice (0 if null)

  realizedPL: number;     // proceeds - (avgBuyPrice * sellQty)
  unrealizedPL: number;   // marketValue - costBasisRemaining
  totalPL: number;        // realized + unrealized
  perfPct: number | null; // (proceeds + marketValue - totalCost) / totalCost
};

export function aggregate(transactions: Transaction[], currentPrice: number | null): Agg {
  const buys = transactions.filter(t => t.type === 'Buy');
  const sells = transactions.filter(t => t.type === 'Sell');

  const buyQty = buys.reduce((s, t) => s + t.quantity, 0);
  const sellQty = sells.reduce((s, t) => s + t.quantity, 0);
  const availableQty = Math.max(0, buyQty - sellQty);

  const totalCost = buys.reduce((s, t) => s + t.quantity * t.pricePerUnit, 0);
  const proceeds  = sells.reduce((s, t) => s + t.quantity * t.pricePerUnit, 0);

  const avgBuyPrice  = buyQty  > 0 ? totalCost / buyQty  : 0;
  const avgSellPrice = sellQty > 0 ? proceeds  / sellQty : 0;

  const costBasisRemaining = avgBuyPrice * availableQty;
  const marketValue = currentPrice ? availableQty * currentPrice : 0;

  const realizedPL   = proceeds - (avgBuyPrice * sellQty);
  const unrealizedPL = marketValue - costBasisRemaining;
  const totalPL      = realizedPL + unrealizedPL;

  const perfPct = totalCost > 0 ? (proceeds + marketValue - totalCost) / totalCost : null;

  return {
    buyQty, sellQty, availableQty,
    avgBuyPrice, avgSellPrice,
    totalCost, proceeds,
    costBasisRemaining, marketValue,
    realizedPL, unrealizedPL, totalPL, perfPct
  };
}
