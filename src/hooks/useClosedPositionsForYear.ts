'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FuturePosition } from '@/lib/types';

/**
 * Hook to fetch CLOSED positions from futures_positions collection
 * filtered by a specific year (based on closedAt timestamp)
 */
export function useClosedPositionsForYear(userId: string | undefined | null, year: number | null) {
  const [positions, setPositions] = useState<FuturePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId || year === null) {
      setPositions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Calculate year boundaries
    const yearStart = Timestamp.fromDate(new Date(`${year}-01-01T00:00:00.000Z`));
    const yearEnd = Timestamp.fromDate(new Date(`${year + 1}-01-01T00:00:00.000Z`));

    // Query futures_positions where status = 'CLOSED' and closedAt is in the year range
    const positionsRef = collection(db, 'users', userId, 'futures_positions');
    const q = query(
      positionsRef,
      where('status', '==', 'CLOSED'),
      where('closedAt', '>=', yearStart),
      where('closedAt', '<', yearEnd)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const closedPositions: FuturePosition[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as FuturePosition));

        // Sort by closedAt descending (most recent first)
        closedPositions.sort((a, b) => {
          const aTime = a.closedAt?.toDate?.()?.getTime() || 0;
          const bTime = b.closedAt?.toDate?.()?.getTime() || 0;
          return bTime - aTime;
        });

        setPositions(closedPositions);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('[useClosedPositionsForYear] Error fetching closed positions:', err);
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId, year]);

  return { positions, loading, error };
}
