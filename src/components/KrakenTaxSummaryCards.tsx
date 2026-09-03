'use client';

import { useState } from 'react';
import { useKrakenYearlySummary } from '@/hooks/useKrakenYearlySummary';
import { exportKrakenLogsToCSV, downloadCSV } from '@/lib/kraken-csv-export';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Coins, Receipt, AlertTriangle, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Props {
  userId?: string | null;
  year?: number;
}

export default function KrakenTaxSummaryCards({ userId, year = 2025 }: Props) {
  const summary = useKrakenYearlySummary(userId || undefined, year);
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const formatEuro = (val: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);

  const isGain = summary.netPnlEur > 0;
  const hasLossLimitWarning = summary.grossLossesEur < -20000;

  const handleExportCSV = async () => {
    if (!userId) {
      toast({
        title: 'Error',
        description: 'User ID not found. Please log in again.',
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);
    try {
      const csvContent = await exportKrakenLogsToCSV(userId, year);
      const filename = `Kraken_Tax_Report_${year}_${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(csvContent, filename);

      toast({
        title: 'Export erfolgreich',
        description: `Steuerbericht für ${year} wurde heruntergeladen. Datei: ${filename}`,
      });
    } catch (error: any) {
      console.error('Export error:', error);
      toast({
        title: 'Export fehlgeschlagen',
        description: error.message || 'Es gab einen Fehler beim Export der Daten.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4 mb-6">
      {/* Warning Banner for German Loss Offset Limit */}
      {hasLossLimitWarning && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-warning/35 bg-warning/[.08] p-3">
          <div className="flex flex-1 items-center gap-2">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-warning" />
            <div>
              <p className="text-[13px] font-semibold text-warning">
                Achtung: Verlustverrechnungsgrenze (§20 EStG) erreicht
              </p>
              <p className="text-[12px] text-muted-foreground">
                Ihre Gesamtverluste übersteigen €20.000. Nur bis zu diesem Betrag können Verluste mit Gewinnen verrechnet werden.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Export Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleExportCSV}
          disabled={isExporting}
          variant="outline"
          size="sm"
          className="h-8 gap-2"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Exportiere...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Export Tax Report (CSV)
            </>
          )}
        </Button>
      </div>

      {/* Summary Tiles Grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {/* Net P&L Tile */}
        <Card className="flex flex-col gap-1.5 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">Netto Gewinn/Verlust</span>
            {isGain ? (
              <TrendingUp className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 shrink-0 text-destructive" />
            )}
          </div>
          <div
            className={cn(
              'font-headline font-mono text-[26px] font-bold tabular-nums tracking-tight',
              isGain ? 'gain' : 'loss'
            )}
          >
            {formatEuro(summary.netPnlEur)}
          </div>
          <p className="text-[12px] text-muted-foreground">
            Jahr {year} | Termingeschäfte
          </p>
        </Card>

        {/* Funding Tile */}
        <Card className="flex flex-col gap-1.5 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">Finanzierungskosten</span>
            <Coins className="h-4 w-4 shrink-0 text-info" />
          </div>
          <div
            className={cn(
              'font-headline font-mono text-[26px] font-bold tabular-nums tracking-tight',
              summary.totalFundingEur < 0 ? 'loss' : 'gain'
            )}
          >
            {formatEuro(summary.totalFundingEur)}
          </div>
          <p className="text-[12px] text-muted-foreground">Funding Rates (netto)</p>
        </Card>

        {/* Fees Tile */}
        <Card className="flex flex-col gap-1.5 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">Gebühren</span>
            <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
          <div className="font-headline font-mono text-[26px] font-bold tabular-nums tracking-tight text-muted-foreground">
            {formatEuro(summary.totalFeesEur)}
          </div>
          <p className="text-[12px] text-muted-foreground">Handelsgebühren</p>
        </Card>

        {/* Taxable Amount Tile */}
        <Card className="flex flex-col gap-1.5 border-warning/35 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">Steuerbasis (vorläufig)</span>
            <Badge variant={summary.taxableAmount > 0 ? 'warning' : 'secondary'}>§20 EStG</Badge>
          </div>
          <div
            className={cn(
              'font-headline font-mono text-[26px] font-bold tabular-nums tracking-tight',
              summary.taxableAmount > 0 ? 'text-warning' : 'text-muted-foreground'
            )}
          >
            {formatEuro(summary.taxableAmount)}
          </div>
          <p className="text-[12px] text-muted-foreground">
            {summary.taxableAmount > 0
              ? 'Unterliegt 25% Abgeltungsteuer'
              : 'Keine Steuerpflicht'}
          </p>
        </Card>
      </div>
    </div>
  );
}
