/**
 * Futures Position Grouping Utility
 * 
 * Hybrid Architecture:
 * - Firestore: Stores granular, per-trade documents (audit trail)
 * - Display: Groups by closingOrderId before rendering (user-friendly)
 */

import type { FuturePosition } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';

export interface GroupedFuturePosition extends FuturePosition {
  // Additional metadata for grouped positions
  relatedTradeIds?: string[];  // Array of position IDs that were grouped
  tradeCount?: number;         // Number of trades aggregated
}

/**
 * Convert Timestamp or Date to milliseconds for comparison
 */
function toMillis(ts: Timestamp | Date | null | undefined): number {
  if (!ts) return 0;
  if (ts instanceof Timestamp) {
    return ts.toMillis();
  }
  if (ts instanceof Date) {
    return ts.getTime();
  }
  return 0;
}

/**
 * Groups closed positions by closingOrderId.
 * Positions from the same closing order (e.g., 2 fills from 1 close order) are merged.
 * 
 * Aggregation logic:
 * - Sizes: summed
 * - P&L: summed (Gross, Fees, Funding, Net)
 * - Prices: weighted average for Entry, latest for Exit
 * - Other fields: taken from first trade (asset, ticker, status, etc.)
 * 
 * @param positions Array of FuturePosition documents from Firestore
 * @returns Array of grouped positions ready for display
 */
export function groupPositionsByClosingOrder(
  positions: FuturePosition[]
): GroupedFuturePosition[] {
  // Separate positions into two groups: with closingOrderId and without
  const withClosingOrder = positions.filter(p => p.closingOrderId);
  const withoutClosingOrder = positions.filter(p => !p.closingOrderId);

  // Group positions that have a closingOrderId
  const orderGroups = new Map<string, FuturePosition[]>();

  for (const pos of withClosingOrder) {
    if (!pos.closingOrderId) continue;
    
    if (!orderGroups.has(pos.closingOrderId)) {
      orderGroups.set(pos.closingOrderId, []);
    }
    orderGroups.get(pos.closingOrderId)!.push(pos);
  }

  // Create grouped positions
  const groupedPositions: GroupedFuturePosition[] = [];

  for (const [orderId, trades] of orderGroups) {
    if (trades.length === 0) continue;

    // Sort by closedAt to ensure consistent ordering
    trades.sort((a, b) => toMillis(a.closedAt) - toMillis(b.closedAt));

    const first = trades[0];
    const last = trades[trades.length - 1];

    // Aggregate financial data
    const totalSize = trades.reduce((sum, t) => sum + (t.size || 0), 0);
    const totalRealizedPnL = trades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
    const totalRealizedPnlEur = trades.reduce((sum, t) => sum + (t.realizedPnlEur || 0), 0);
    const totalFeeEur = trades.reduce((sum, t) => sum + (t.feeEur || 0), 0);
    const totalFundingEur = trades.reduce((sum, t) => sum + (t.fundingEur || 0), 0);
    const totalNetPnlEur = trades.reduce((sum, t) => sum + (t.netRealizedPnlEur || 0), 0);

    // Calculate weighted average entry price (USD)
    let weightedEntryPrice = 0;
    let totalNotional = 0;
    for (const trade of trades) {
      if (trade.entryPrice && trade.size) {
        weightedEntryPrice += trade.entryPrice * trade.size;
        totalNotional += trade.size;
      }
    }
    if (totalNotional > 0) {
      weightedEntryPrice /= totalNotional;
    }

    // Calculate weighted average entry price in EUR
    let weightedEntryPriceEur = 0;
    for (const trade of trades) {
      if (trade.entryPrice && trade.size && trade.exchangeRate) {
        const entryPriceEur = trade.entryPrice * trade.exchangeRate;
        weightedEntryPriceEur += entryPriceEur * trade.size;
      }
    }
    if (totalNotional > 0) {
      weightedEntryPriceEur /= totalNotional;
    }

    // Take the latest exit price (last fill) and convert to EUR
    const exitPrice = last.exitPrice || 0;
    const exitPriceEur = exitPrice * (first.exchangeRate || 0.85);

    // Find earliest open date
    let earliestOpenedAt = first.openedAt;
    for (const trade of trades) {
      if (toMillis(trade.openedAt) < toMillis(earliestOpenedAt)) {
        earliestOpenedAt = trade.openedAt;
      }
    }

    // Create grouped position
    const grouped: GroupedFuturePosition = {
      ...first,
      
      // Use first trade's ID but mark as grouped
      id: `GROUPED-${orderId}`,
      
      // Aggregated financial data
      size: totalSize,
      entryPrice: weightedEntryPrice,
      exitPrice: exitPrice,
      realizedPnL: totalRealizedPnL,
      realizedPnlEur: totalRealizedPnlEur,
      feeEur: totalFeeEur,
      fundingEur: totalFundingEur,
      netRealizedPnlEur: totalNetPnlEur,
      
      // Metadata
      relatedTradeIds: trades.map(t => t.id),
      tradeCount: trades.length,
      
      // Use earliest open date, latest close date
      openedAt: earliestOpenedAt,
      closedAt: last.closedAt,
    };

    groupedPositions.push(grouped);
  }

  // Add ungrouped positions (those without closingOrderId)
  for (const pos of withoutClosingOrder) {
    groupedPositions.push(pos as GroupedFuturePosition);
  }

  return groupedPositions;
}
