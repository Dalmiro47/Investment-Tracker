import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';

export interface YearlyTaxSummary {
  grossGainsEur: number;   
  grossLossesEur: number;  
  netPnlEur: number;       
  totalFundingEur: number; 
  totalFeesEur: number;    
  taxableAmount: number;   
}

export function useKrakenYearlySummary(userId: string | undefined, year?: number | null) {
  const [summary, setSummary] = useState<YearlyTaxSummary>({
    grossGainsEur: 0, grossLossesEur: 0, netPnlEur: 0,
    totalFundingEur: 0, totalFeesEur: 0, taxableAmount: 0
  });

  useEffect(() => {
    if (!userId) return;

    // FIX: Switch source from 'kraken_logs' to 'futures_positions'
    // This ensures we tax the NET result of the position, not the gross raw events.
    const positionsRef = collection(db, 'users', userId, 'futures_positions');
    
    let q;
    if (year != null) {
      const startOfYear = Timestamp.fromDate(new Date(`${year}-01-01T00:00:00Z`));
      const endOfYear = Timestamp.fromDate(new Date(`${year}-12-31T23:59:59Z`));
      
      q = query(
        positionsRef,
        where('status', '==', 'CLOSED'),
        where('closedAt', '>=', startOfYear),
        where('closedAt', '<=', endOfYear)
      );
    } else {
      q = query(
        positionsRef, 
        where('status', '==', 'CLOSED')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const totals = snapshot.docs.reduce((acc, doc) => {
        const data = doc.data();
        
        // 1. Get the NET Result (already calculated in kraken-sync.ts)
        // This includes: Realized PnL - Fees + Funding
        const netResult = data.netRealizedPnlEur || 0;

        // 2. Info metrics (just for display)
        const funding = data.fundingEur || 0;
        const fee = data.feeEur || 0;

        // 3. Proper Tax Bucketing
        // If the entire position netted a profit, it is a GAIN.
        // If the entire position netted a loss, it is a LOSS.
        return {
          grossGainsEur: acc.grossGainsEur + (netResult > 0 ? netResult : 0),
          grossLossesEur: acc.grossLossesEur + (netResult < 0 ? Math.abs(netResult) : 0), // Absolute value for loss bucket
          
          totalFundingEur: acc.totalFundingEur + funding,
          totalFeesEur: acc.totalFeesEur + fee,
        };
      }, { grossGainsEur: 0, grossLossesEur: 0, totalFundingEur: 0, totalFeesEur: 0 });

      // Final Calculation
      // Since we used Net Result above, Taxable Amount is Gains - Losses
      const taxableAmount = totals.grossGainsEur - totals.grossLossesEur;

      setSummary({
        ...totals,
        netPnlEur: taxableAmount,
        taxableAmount
      });
    });

    return () => unsubscribe();
  }, [userId, year]);

  return summary;
}
