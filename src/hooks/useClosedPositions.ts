'use client';

import { useCallback, useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FuturePosition } from '@/lib/types';

const PAGE_SIZE = 50;

/**
 * Hook to fetch CLOSED positions from futures_positions collection.
 *
 * Pagination: starts at PAGE_SIZE rows and grows by PAGE_SIZE each time
 * `loadMore` is called. We over-fetch by one row to detect `hasMore`
 * without an extra round-trip.
 */
export function useClosedPositions(userId: string | undefined | null) {
  const [positions, setPositions] = useState<FuturePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!userId) {
      setPositions([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    const positionsRef = collection(db, 'users', userId, 'futures_positions');
    const q = query(
      positionsRef,
      where('status', '==', 'CLOSED'),
      orderBy('closedAt', 'desc'),
      limit(pageSize + 1)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs;
        const moreAvailable = docs.length > pageSize;
        const visible = moreAvailable ? docs.slice(0, pageSize) : docs;

        const closedPositions: FuturePosition[] = visible.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        } as FuturePosition));

        setPositions(closedPositions);
        setHasMore(moreAvailable);
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
  }, [userId, pageSize]);

  const loadMore = useCallback(() => {
    setPageSize((prev) => prev + PAGE_SIZE);
  }, []);

  return { positions, loading, error, hasMore, loadMore };
}
