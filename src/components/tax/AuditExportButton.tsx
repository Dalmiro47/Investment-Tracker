'use client';

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Transaction, FuturePosition } from "@/lib/types";

interface AuditExportButtonProps {
  transactions: (Transaction & { asset?: string; krakenId?: string | number; rawType?: string })[];
  positions: FuturePosition[];
  year: number;
}

/**
 * Formats a number to German locale (uses comma as decimal separator, dot as thousands separator)
 */
function formatGermanCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '0,00';
  return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formats a date to ISO format (YYYY-MM-DD HH:mm:ss) for consistency
 */
function formatDate(date: string | Date | { toDate?: () => Date }): string {
  let d: Date;
  
  if (typeof date === 'string') {
    d = new Date(date);
  } else if (date instanceof Date) {
    d = date;
  } else if (date && typeof date.toDate === 'function') {
    // Firestore Timestamp
    d = date.toDate();
  } else {
    d = new Date();
  }
  
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Links transactions to their parent position using orderId or timestamp fallback
 */
function linkTransactionsToPositions(
  positions: FuturePosition[],
  transactions: (Transaction & { asset?: string; krakenId?: string | number; rawType?: string })[]
): Map<string, (Transaction & { asset?: string; krakenId?: string | number; rawType?: string })[]> {
  const positionMap = new Map<string, (Transaction & { asset?: string; krakenId?: string | number; rawType?: string })[]>();
  
  // Initialize map with empty arrays for each position
  positions.forEach(pos => {
    positionMap.set(pos.id, []);
  });
  
  // Try to link each transaction to a position
  transactions.forEach(txn => {
    let matched = false;
    
    for (const pos of positions) {
      // Strategy 1: Match by orderId
      if (pos.closingOrderId && txn.krakenId && String(txn.krakenId) === String(pos.closingOrderId)) {
        positionMap.get(pos.id)?.push(txn);
        matched = true;
        break;
      }
      
      // Strategy 2: Match by timestamp + ticker (fallback)
      if (!matched && pos.closedAt && pos.ticker) {
        const posClosedDate = formatDate(pos.closedAt);
        const txnDate = formatDate(txn.date);
        const posAsset = (pos.asset || pos.ticker || '').toLowerCase();
        const txnAsset = (txn.asset || '').toLowerCase();
        
        // Match if dates are the same (down to second) and asset matches
        if (posClosedDate === txnDate && posAsset.includes(txnAsset.split('/')[0])) {
          positionMap.get(pos.id)?.push(txn);
          matched = true;
          break;
        }
      }
    }
  });
  
  return positionMap;
}

export function AuditExportButton({ transactions, positions, year }: AuditExportButtonProps) {
  const handleDownloadCSV = () => {
    // Bilingual headers (English / German) - All amounts in EUR
    const headers = [
      "ID/Gruppe",
      "Type/Art", 
      "Date/Datum",
      "Asset/Anlage",
      "Order ID",
      "Net PnL/Netto Gewinn (EUR)",
      "Total Fees/Gesamtgebühren (EUR)",
      "Trade Value/Handelswert (EUR)"
    ];
    
    const rows: string[][] = [];
    
    // Deduplicate positions by closingOrderId to avoid duplicate summaries
    const uniquePositions = new Map<string, FuturePosition>();
    positions.forEach(pos => {
      const key = pos.closingOrderId || pos.id;
      const existing = uniquePositions.get(key);
      // Keep the position with the highest PnL (most complete data)
      if (!existing || (pos.netRealizedPnlEur || 0) > (existing.netRealizedPnlEur || 0)) {
        uniquePositions.set(key, pos);
      }
    });
    
    // Link transactions to positions
    const positionTransactionMap = linkTransactionsToPositions(Array.from(uniquePositions.values()), transactions);
    
    // Generate hierarchical CSV: Position Summary -> Child Transactions
    uniquePositions.forEach(position => {
      const childTransactions = positionTransactionMap.get(position.id) || [];
      const positionAsset = position.asset || position.ticker || 'N/A';
      
      // Use feeEur from the position (same as futures-positions-table.tsx logic)
      const totalFees = position.feeEur || 0;
      
      // 1. Add POSITION_SUMMARY row
      rows.push([
        position.id,                                              // ID/Gruppe
        'POSITION_SUMMARY',                                       // Type/Art
        formatDate(position.closedAt || new Date()),              // Date/Datum
        positionAsset,                                            // Asset/Anlage
        position.closingOrderId || '',                            // Order ID
        formatGermanCurrency(position.netRealizedPnlEur || position.realizedPnlEur || 0), // Net PnL
        formatGermanCurrency(totalFees),                          // Total Fees
        ''                                                        // Trade Value (empty for summary)
      ]);
      
      // 2. Add child TRADE rows
      childTransactions.forEach(txn => {
        // Extract orderId from metadata
        const tradeOrderId = txn.metadata?.orderId || String(txn.krakenId || '');
        
        rows.push([
          position.id,                                           // ID/Gruppe (same as parent)
          'TRADE',                                               // Type/Art
          formatDate(txn.date),                                  // Date/Datum
          txn.asset || positionAsset,                            // Asset/Anlage (inherit from position if missing)
          tradeOrderId,                                          // Order ID (from metadata or krakenId)
          '',                                                    // Net PnL (empty for detail)
          formatGermanCurrency((txn as any).feeEur || 0),        // Fee for this trade
          formatGermanCurrency(txn.valueInEur || 0)              // Trade Value (EUR converted)
        ]);
      });
    });
    
    // Create CSV content with proper escaping (using comma separator for universal compatibility)
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => {
        const str = String(cell);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(","))
      .join("\n");
    
    // Use UTF-8 BOM for Excel compatibility with German characters
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Kraken_Futures_Audit_Hierarchical_${year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  };

  if (transactions.length === 0 && positions.length === 0) {
    return null;
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDownloadCSV} className="w-full sm:w-auto">
      <Download className="mr-2 h-4 w-4" />
      Export Audit CSV ({year})
    </Button>
  );
}
