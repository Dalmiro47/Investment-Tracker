import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

/**
 * HEAVY LIFTING: Real-time Tax Data Aggregator
 * This hook sums up all funding and P&L logs for a specific asset.
 */
export function useKrakenTaxData(userId: string | undefined, asset: string) {
  const [totals, setTotals] = useState({
    fundingNetEur: 0,
    realizedPnlEur: 0,
    feeTotalEur: 0,
    count: 0
  });

  useEffect(() => {
    if (!userId || !asset) return;

    // We query the kraken_logs collection we just built
    const logsRef = collection(db, 'users', userId, 'kraken_logs');
    
    // Fetch all logs and filter in the reducer since Kraken uses 'contract' field
    // (e.g., 'pf_ethusd') instead of just 'asset' (which is often 'usd' or 'eur')
    const q = query(logsRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newTotals = snapshot.docs.reduce((acc, doc) => {
        const data = doc.data();
        const contract = (data.contract || '').toLowerCase();
        const dataAsset = (data.asset || '').toLowerCase();
        const ticker = asset.toLowerCase();

        // Only sum if the log belongs to this specific asset/contract
        // Check if contract contains ticker (e.g., 'eth' in 'pf_ethusd')
        // or if asset matches directly
        if (contract.includes(ticker) || dataAsset === ticker) {
          return {
            fundingNetEur: acc.fundingNetEur + (data.realizedFundingEur || 0),
            realizedPnlEur: acc.realizedPnlEur + (data.realizedPnlEur || 0),
            feeTotalEur: acc.feeTotalEur + (data.feeEur || 0),
            count: acc.count + 1
          };
        }
        return acc;
      }, { fundingNetEur: 0, realizedPnlEur: 0, feeTotalEur: 0, count: 0 });

      setTotals(newTotals);
    });

    return () => unsubscribe();
  }, [userId, asset]);

  return totals;
}
