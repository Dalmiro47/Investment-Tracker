import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';

const EMPTY_TOTALS = {
  fundingNetEur: 0,
  realizedPnlEur: 0,
  feeTotalEur: 0,
  count: 0
};

/**
 * HEAVY LIFTING: Real-time Tax Data Aggregator
 * This hook sums up funding and P&L logs for a specific asset, from `since` onwards.
 *
 * QUOTA GUARD: `kraken_logs` holds one doc per hourly funding event, so it grows by
 * thousands of docs per year. An unbounded listener here re-reads the whole collection
 * on every page load and burned the Firestore daily read quota (RESOURCE_EXHAUSTED).
 * Without a `since` date the hook does not subscribe at all.
 */
export function useKrakenTaxData(
  userId: string | undefined,
  asset: string,
  since: Date | null | undefined
) {
  const [totals, setTotals] = useState(EMPTY_TOTALS);

  const sinceMs = since ? since.getTime() : null;

  useEffect(() => {
    if (!userId || !asset || sinceMs === null || Number.isNaN(sinceMs)) {
      setTotals(EMPTY_TOTALS);
      return;
    }

    // We query the kraken_logs collection we just built
    const logsRef = collection(db, 'users', userId, 'kraken_logs');

    // Bound by date only and filter the asset in the reducer, since Kraken uses the
    // 'contract' field (e.g., 'pf_ethusd') instead of just 'asset' (often 'usd' or 'eur')
    const q = query(logsRef, where('date', '>=', Timestamp.fromMillis(sinceMs)));

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
      }, { ...EMPTY_TOTALS });

      setTotals(newTotals);
    });

    return () => unsubscribe();
  }, [userId, asset, sinceMs]);

  return totals;
}
