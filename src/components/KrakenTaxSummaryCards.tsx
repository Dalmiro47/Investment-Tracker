'use client';

import { useState } from 'react';
import { useKrakenYearlySummary } from '@/hooks/useKrakenYearlySummary';
import { exportKrakenLogsToCSV, downloadCSV } from '@/lib/kraken-csv-export';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
        <div className="flex items-center justify-between gap-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-center gap-2 flex-1">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Achtung: Verlustverrechnungsgrenze (§20 EStG) erreicht
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
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
          className="gap-2"
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

      {/* Summary Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Net P&L Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Netto Gewinn/Verlust</CardTitle>
            {isGain ? (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', isGain ? 'text-emerald-600' : 'text-red-600')}>
              {formatEuro(summary.netPnlEur)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Jahr {year} | Termingeschäfte
            </p>
          </CardContent>
        </Card>

        {/* Funding Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Finanzierungskosten</CardTitle>
            <Coins className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'text-2xl font-bold',
                summary.totalFundingEur < 0 ? 'text-red-600' : 'text-emerald-600'
              )}
            >
              {formatEuro(summary.totalFundingEur)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Funding Rates (netto)</p>
          </CardContent>
        </Card>

        {/* Fees Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gebühren</CardTitle>
            <Receipt className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">
              {formatEuro(summary.totalFeesEur)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Handelsgebühren</p>
          </CardContent>
        </Card>

        {/* Taxable Amount Card */}
        <Card className="border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Steuerbasis (vorläufig)</CardTitle>
            <Badge variant={summary.taxableAmount > 0 ? 'default' : 'secondary'}>§20 EStG</Badge>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'text-2xl font-bold',
                summary.taxableAmount > 0 ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {formatEuro(summary.taxableAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.taxableAmount > 0
                ? 'Unterliegt 25% Abgeltungsteuer'
                : 'Keine Steuerpflicht'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
