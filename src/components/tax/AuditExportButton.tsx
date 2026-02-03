'use client';

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Transaction, FuturePosition } from "@/lib/types";

interface AuditExportButtonProps {
  transactions: (Transaction & { asset?: string; krakenId?: string | number; rawType?: string })[];
  positions: FuturePosition[];
  year: number;
}

// 1. Raw Currency (2 decimals, DOT separator, NO thousands separator) -> "1234.56"
function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '0.00';
  // en-US with useGrouping: false ensures "1234.56" (no commas, dot decimal)
  return value.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2, 
    useGrouping: false 
  });
}

// 2. Raw Price (4 decimals, DOT separator, NO thousands separator) -> "0.3635"
function formatPrice(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '0.0000';
  return value.toLocaleString('en-US', { 
    minimumFractionDigits: 4, 
    maximumFractionDigits: 4, 
    useGrouping: false 
  });
}

// 3. Raw Quantity (Up to 8 decimals, DOT separator, NO thousands separator) -> "1000.123"
function formatQuantity(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '0';
  return value.toLocaleString('en-US', { 
    maximumFractionDigits: 8, 
    useGrouping: false 
  });
}

function formatDate(date: string | Date | { toDate?: () => Date }): string {
  let d: Date;
  if (typeof date === 'string') d = new Date(date);
  else if (date instanceof Date) d = date;
  else if (date && typeof date.toDate === 'function') d = date.toDate();
  else d = new Date();
  
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

// Helper to remove duplicate trades (if API returns overlaps)
function deduplicateTransactions(txs: any[]) {
  const seen = new Set();
  return txs.filter(tx => {
    const uniqueId = tx.krakenId || tx.id; 
    if (seen.has(uniqueId)) return false;
    seen.add(uniqueId);
    return true;
  });
}

function linkTransactionsToPositions(
  positions: FuturePosition[],
  transactions: (Transaction & { asset?: string; krakenId?: string | number; rawType?: string })[]
): Map<string, any[]> {
  const positionMap = new Map<string, any[]>();
  positions.forEach(pos => positionMap.set(pos.id, []));
  
  transactions.forEach(txn => {
    // Helper to normalize IDs
    const txnId = txn.id;
    const txnOrderId = txn.metadata?.orderId ? String(txn.metadata.orderId).trim() : null;
    const txnSymbol = (txn.asset || txn.metadata?.symbol || (txn as any).symbol || '').toLowerCase();
    const txnTime = new Date(txn.date).getTime();

    let matched = false;

    for (const pos of positions) {
      const posId = pos.id;
      const posClosingTradeId = pos.closingTradeId ? String(pos.closingTradeId).trim() : null;
      const posOrderId = pos.closingOrderId ? String(pos.closingOrderId).trim() : null;
      
      // ---------------------------------------------------------
      // STRATEGY 1: Direct Trade ID Match (Highest Confidence)
      // ---------------------------------------------------------
      if (posClosingTradeId && posClosingTradeId === txnId) {
        positionMap.get(posId)?.push(txn);
        matched = true;
        break; 
      }

      // ---------------------------------------------------------
      // STRATEGY 2: Order ID Match (Group Confidence)
      // ---------------------------------------------------------
      if (posOrderId && txnOrderId && posOrderId === txnOrderId) {
        positionMap.get(posId)?.push(txn);
        matched = true;
        break;
      }

      // ---------------------------------------------------------
      // STRATEGY 3: Time Window + Asset (Fallback)
      // ---------------------------------------------------------
      if (!matched && pos.closedAt && pos.ticker) {
        const posTime = new Date(typeof pos.closedAt === 'string' ? pos.closedAt : (pos.closedAt as any).toDate?.() || pos.closedAt).getTime();
        const posAsset = (pos.asset || pos.ticker || '').toLowerCase();

        // Check Asset Match (looking inside metadata.symbol too)
        // e.g. pos="eth" vs txn="pf_ethusd"
        const isAssetMatch = 
            posAsset.includes(txnSymbol.split('/')[0]) || 
            txnSymbol.includes(posAsset.split('-')[0]) ||
            (txnSymbol !== '' && posAsset.includes(txnSymbol));

        // Check Time Window (6 hours)
        const timeDiff = Math.abs(posTime - txnTime);
        const MAX_DIFF_MS = 6 * 60 * 60 * 1000; 

        if (isAssetMatch && timeDiff <= MAX_DIFF_MS) {
           positionMap.get(posId)?.push(txn);
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
    // 1. FINAL AUDIT HEADERS
    // Added "Entry Price" and renamed "Price" to "Exit Price" for clarity
    const headers = [
      "ID/Gruppe",
      "Type/Art", 
      "Date/Datum",
      "Asset/Anlage",
      "Order ID/Auftrags-ID",
      "Trade ID/Transaktions-ID",
      "Gross PnL/Brutto Gewinn (EUR)",
      "Fees/Gebühren (EUR)",
      "Funding/Finanzierung (EUR)",
      "Net PnL/Netto Gewinn (EUR)",
      "Quantity/Menge",
      "Entry Price/Einstieg (EUR)", // NEW: Required for verification
      "Exit Price/Ausstieg (EUR)"   // Renamed for clarity
    ];
    
    const rows: string[][] = [];
    
    // Aggregation Logic (Merge partial fills by Closing Order)
    const groupedPositions = new Map<string, FuturePosition>();
    positions.forEach(pos => {
      const key = pos.closingOrderId ? String(pos.closingOrderId).trim() : pos.id;
      if (!groupedPositions.has(key)) {
        groupedPositions.set(key, { ...pos });
      } else {
        const existing = groupedPositions.get(key)!;
        existing.realizedPnL = (existing.realizedPnL || 0) + (pos.realizedPnL || 0);
        existing.realizedPnlEur = (existing.realizedPnlEur || 0) + (pos.realizedPnlEur || 0);
        existing.feeEur = (existing.feeEur || 0) + (pos.feeEur || 0);
        existing.fundingEur = (existing.fundingEur || 0) + (pos.fundingEur || 0);
        existing.netRealizedPnlEur = (existing.netRealizedPnlEur || 0) + (pos.netRealizedPnlEur || 0);
        existing.size = (existing.size || 0) + (pos.size || 0);
      }
    });

    const uniquePositions = Array.from(groupedPositions.values());
    const positionTransactionMap = linkTransactionsToPositions(uniquePositions, transactions);
    
    uniquePositions.forEach(position => {
      const rawChildren = positionTransactionMap.get(position.id) || [];
      const uniqueChildren = deduplicateTransactions(
        rawChildren.filter(t => !t.id.startsWith('TAX-'))
      ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const positionAsset = position.asset || position.ticker || 'N/A';
      
      // 1. Calculate Weighted Average Exit Price (USD)
      let totalExitValUsd = 0;
      let totalExitQty = 0;
      
      uniqueChildren.forEach(t => {
         const qty = t.quantity || 0;
         const price = t.pricePerUnit || 0;
         totalExitValUsd += (qty * price);
         totalExitQty += qty;
      });
      
      // Fallback to position.exitPrice if no children or qty is 0
      const avgExitPriceUsd = totalExitQty > 0 
          ? (totalExitValUsd / totalExitQty) 
          : (position.exitPrice || 0);

      // 2. Prepare Rates
      // Use the Position's rate as the "Master Rate" for this group to ensure consistency
      const masterExchangeRate = position.exchangeRate || 0.85; 

      const entryPriceEur = (position.entryPrice || 0) * masterExchangeRate;
      const exitPriceEur = avgExitPriceUsd * masterExchangeRate;

      // --- SUMMARY ROW ---
      rows.push([
        position.closingOrderId || position.id,
        'POSITION_SUMMARY',
        formatDate(position.closedAt || new Date()),
        positionAsset,
        position.closingOrderId || '',
        '',
        formatCurrency(position.realizedPnlEur || 0),
        formatCurrency(position.feeEur || 0),
        formatCurrency(position.fundingEur || 0),
        formatCurrency(position.netRealizedPnlEur || 0),
        formatQuantity(position.size || 0),
        formatPrice(entryPriceEur), // Consistent Entry (EUR)
        formatPrice(exitPriceEur)   // Weighted Avg Exit (EUR)
      ]);
      
      // --- TRADE ROWS ---
      uniqueChildren.forEach(txn => {
        const tradeOrderId = txn.metadata?.orderId || '';
        const tradeId = txn.krakenId ? String(txn.krakenId) : (txn.id || '');
        const tradeQty = txn.quantity || 0;
        
        // Use Master Rate for consistency with Summary Row
        const tradeEntryPriceEur = (position.entryPrice || 0) * masterExchangeRate;
        const tradeExitPriceEur = (txn.pricePerUnit || 0) * masterExchangeRate;

        rows.push([
          position.closingOrderId || position.id,
          'TRADE',
          formatDate(txn.date),
          txn.asset || positionAsset,
          tradeOrderId,
          tradeId,
          '', 
          formatCurrency((txn as any).feeEur || 0),
          '', 
          '', 
          formatQuantity(tradeQty),     
          formatPrice(tradeEntryPriceEur), // Matches Summary Entry
          formatPrice(tradeExitPriceEur)   // Specific Trade Exit (EUR)
        ]);
      });
    });
    
    // 1. Force Semicolon Separator for German Locale Compatibility
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => {
        const str = String(cell);
        // Only wrap in quotes if it contains the DELIMITER (;) or quotes/newlines
        if (str.includes(';') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(";")) // <--- JOIN WITH SEMICOLON
      .join("\n");
    
    // 2. CREATE BLOB WITH MAGIC HEADER
    const BOM = '\uFEFF'; // UTF-8 BOM for special chars
    const SEP_INSTRUCTION = 'sep=;\n'; // Forces Excel to use Semicolon
    
    // Combine: BOM + Separator Instruction + Content
    const blob = new Blob([BOM + SEP_INSTRUCTION + csvContent], { type: 'text/csv;charset=utf-8;' });
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
