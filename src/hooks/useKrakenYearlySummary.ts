import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';

export interface YearlyTaxSummary {
  grossGainsEur: number;   // Total of all profitable trades
  grossLossesEur: number;  // Total of all losing trades (to check vs €20k limit)
  netPnlEur: number;       // Final P&L
  totalFundingEur: number; // Total funding paid/received
  totalFeesEur: number;    // Total execution fees
  taxableAmount: number;   // Preliminary taxable base
}

export function useKrakenYearlySummary(userId: string | undefined, year?: number | null) {
  const [summary, setSummary] = useState<YearlyTaxSummary>({
    grossGainsEur: 0, grossLossesEur: 0, netPnlEur: 0,
    totalFundingEur: 0, totalFeesEur: 0, taxableAmount: 0
  });

  useEffect(() => {
    if (!userId) return;

    const logsRef = collection(db, 'users', userId, 'kraken_logs');
    
    // If year is provided, filter by year; otherwise fetch all (lifetime)
    let q;
    if (year != null) {
      const startOfYear = Timestamp.fromDate(new Date(`${year}-01-01T00:00:00Z`));
      const endOfYear = Timestamp.fromDate(new Date(`${year}-12-31T23:59:59Z`));
      q = query(
        logsRef,
        where('timestamp', '>=', startOfYear),
        where('timestamp', '<=', endOfYear)
      );
    } else {
      // No year filter - fetch all records for lifetime summary
      q = query(logsRef);
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const totals = snapshot.docs.reduce((acc, doc) => {
        const data = doc.data();
        const pnl = data.realizedPnlEur || 0;
        const funding = data.realizedFundingEur || 0;
        const fee = data.feeEur || 0;

        return {
          grossGainsEur: acc.grossGainsEur + (pnl > 0 ? pnl : 0),
          grossLossesEur: acc.grossLossesEur + (pnl < 0 ? pnl : 0),
          totalFundingEur: acc.totalFundingEur + funding,
          totalFeesEur: acc.totalFeesEur + fee,
        };
      }, { grossGainsEur: 0, grossLossesEur: 0, totalFundingEur: 0, totalFeesEur: 0 });

      // German Tax Math: P&L + Funding - Fees
      const netPnl = totals.grossGainsEur + totals.grossLossesEur;
      
      setSummary({
        ...totals,
        netPnlEur: netPnl,
        taxableAmount: netPnl + totals.totalFundingEur - totals.totalFeesEur
      });
    });

    return () => unsubscribe();
  }, [userId, year]);

  return summary;
}
