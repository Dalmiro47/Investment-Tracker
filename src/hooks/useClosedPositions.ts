'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FuturePosition } from '@/lib/types';

/**
 * Hook to fetch CLOSED positions from futures_positions collection
 * and enrich them with realized P&L data from kraken_logs
 */
export function useClosedPositions(userId: string | undefined | null) {
  const [positions, setPositions] = useState<FuturePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setPositions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // FIX: Limit to 50 most recent. Add pagination button in UI if needed later.
    const positionsRef = collection(db, 'users', userId, 'futures_positions');
    const q = query(
      positionsRef,
      where('status', '==', 'CLOSED'),
      orderBy('closedAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const closedPositions: FuturePosition[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as FuturePosition));

        setPositions(closedPositions);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[useClosedPositions] Error fetching closed positions:', err);
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return { positions, loading, error };
}
