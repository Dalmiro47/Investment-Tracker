'use client';

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Transaction, FuturePosition } from "@/lib/types";

interface AuditExportButtonProps {
  transactions: (Transaction & { asset?: string; krakenId?: string | number; rawType?: string })[];
  positions: FuturePosition[];
  year: number;
}

// Formatter for EUR Currency (2 decimals) -> "1.234,56"
function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '0,00';
  return value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formatter for Unit Price (4 decimals) -> "0,3635"
function formatPrice(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '0,0000';
  return value.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

// Formatter for Quantity (Up to 8 decimals) -> "0,001"
function formatQuantity(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '0';
  return value.toLocaleString('de-DE', { maximumFractionDigits: 8 });
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
    let matched = false;
    for (const pos of positions) {
      const posOrderId = pos.closingOrderId ? String(pos.closingOrderId).trim() : null;
      const txnOrderId = txn.metadata?.orderId || (txn.krakenId ? String(txn.krakenId).trim() : null);
      
      // 1. Strict Order ID Match
      if (posOrderId && txnOrderId && posOrderId === txnOrderId) {
        positionMap.get(pos.id)?.push(txn);
        matched = true;
        break;
      }
      
      // 2. Fallback: Timestamp + Asset Match
      if (!matched && pos.closedAt && pos.ticker) {
        const posClosedDate = formatDate(pos.closedAt);
        const txnDate = formatDate(txn.date);
        const posAsset = (pos.asset || pos.ticker || '').toLowerCase();
        const txnAsset = (txn.asset || '').toLowerCase();
        
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
      
      // Calculate Weighted Average Entry Price in EUR for the Summary Row
      // (Entry Price * Exchange Rate)
      const entryPriceEur = (position.entryPrice || 0) * (position.exchangeRate || 0.85);

      // Calculate Weighted Average Exit Price for the Summary
      let totalExitVal = 0;
      let totalExitQty = 0;
      uniqueChildren.forEach(t => {
        totalExitVal += (t.pricePerUnit || 0) * (t.quantity || 0);
        totalExitQty += (t.quantity || 0);
      });
      const avgExitPriceUsd = totalExitQty > 0 ? (totalExitVal / totalExitQty) : 0;
      const avgExitPriceEur = avgExitPriceUsd * (position.exchangeRate || 0.85);

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
        formatPrice(entryPriceEur), // Show Avg Entry Price
        formatPrice(avgExitPriceEur) // Show Avg Exit Price (weighted)
      ]);
      
      // --- TRADE ROWS ---
      uniqueChildren.forEach(txn => {
        const tradeOrderId = txn.metadata?.orderId || '';
        const tradeId = txn.krakenId ? String(txn.krakenId) : (txn.id || '');
        const tradeQty = txn.quantity || 0;
        
        // Convert prices to EUR
        const exchangeRate = txn.exchangeRate || position.exchangeRate || 0.85;
        const exitPriceEur = (txn.pricePerUnit || 0) * exchangeRate;
        
        // For the trade row, we use the Position's avg entry price 
        // (because continuous futures don't have a per-trade entry price)
        const tradeEntryPriceEur = (position.entryPrice || 0) * exchangeRate;

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
          formatQuantity(tradeQty),     // Col K: Number format
          formatPrice(tradeEntryPriceEur), // Col L: Entry Price (4 decimals)
          formatPrice(exitPriceEur)        // Col M: Exit Price (4 decimals)
        ]);
      });
    });
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => {
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(","))
      .join("\n");
    
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
