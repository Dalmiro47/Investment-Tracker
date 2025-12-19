'use client';

import { useKrakenSync } from '@/hooks/useKrakenSync';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, CheckCircle2, AlertCircle, Database } from 'lucide-react';

export default function KrakenSettingsPage() {
  const { syncLogs, loading, error, syncedCount } = useKrakenSync();

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Kraken Data Sync
          </CardTitle>
          <CardDescription>
            Synchronize your futures ledger to Firestore for German Tax calculations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div>
              <p className="font-medium">Account History Ledger</p>
              <p className="text-sm text-muted-foreground">
                Includes Funding Rates, P&L, and Fees.
              </p>
            </div>
            <Button onClick={() => syncLogs()} disabled={loading} className="min-w-[120px]">
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                'Sync Now'
              )}
            </Button>
          </div>

          {syncedCount !== null && !error && (
            <div className="flex items-center gap-2 p-3 text-sm text-green-600 bg-green-50 rounded-md border border-green-200">
              <CheckCircle2 className="h-4 w-4" />
              Successfully processed {syncedCount} log entries to Firestore.
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
              <AlertCircle className="h-4 w-4" />
              Error: {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
