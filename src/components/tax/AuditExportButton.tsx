'use client';

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Transaction } from "@/lib/types";

interface AuditExportButtonProps {
  transactions: (Transaction & { asset?: string; krakenId?: string | number; rawType?: string })[];
  year: number;
}

export function AuditExportButton({ transactions, year }: AuditExportButtonProps) {
  const handleDownloadCSV = () => {
    const headers = ["Date", "Type", "Amount(USD)", "FX_Rate", "Amount(EUR)", "Kraken_ID"];
    
    const rows = transactions.map(t => {
      // Transaction.date is ISO string
      const dateStr = t.date || new Date().toISOString();
      
      return [
        dateStr,
        t.rawType || t.type || '',
        t.totalAmount?.toFixed(2) || '0.00',
        t.exchangeRate?.toFixed(4) || '0.0000',
        t.valueInEur?.toFixed(2) || '0.00',
        String(t.krakenId || '')
      ];
    });

    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Kraken_Futures_Audit_${year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  };

  if (transactions.length === 0) {
    return null;
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDownloadCSV} className="w-full sm:w-auto">
      <Download className="mr-2 h-4 w-4" />
      Export Audit CSV ({year})
    </Button>
  );
}
