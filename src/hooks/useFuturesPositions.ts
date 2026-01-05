'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  type FirestoreError,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FuturePosition } from '@/lib/types';

export type UseFuturesPositionsOptions = {
  /**
   * Owner of the futures positions. In most cases this will be the authenticated user's UID.
   */
  userId?: string | null;
};

type UseFuturesPositionsState = {
  positions: FuturePosition[];
  loading: boolean;
  error: FirestoreError | null;
  isMock: boolean;
};

const FUTURES_COLLECTION = 'futures_positions';

// --- Hook -------------------------------------------------------------------

export function useFuturesPositions(
  opts: UseFuturesPositionsOptions = {}
): UseFuturesPositionsState {
  const { userId } = opts;
  
  const [state, setState] = useState<UseFuturesPositionsState>({
    positions: [],
    loading: true,
    error: null,
    isMock: false,
  });

  useEffect(() => {
    // No user bound yet – expose empty list but don't treat as error.
    if (!userId) {
      setState((prev) => ({
        ...prev,
        positions: [],
        loading: false,
        error: null,
        isMock: false,
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null, isMock: false }));

    // FIX: Only fetch OPEN positions here.
    // Read the per-user futures positions subcollection so Firestore rules match
    const colRef = collection(db, 'users', userId!, FUTURES_COLLECTION);
    const q = query(
      colRef,
      where('status', '==', 'OPEN'),
      orderBy('openedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next: FuturePosition[] = snapshot.docs.map((doc) => {
          const data = doc.data() as Omit<FuturePosition, 'id'>;
          return {
            id: doc.id,
            ...data,
          };
        });

        setState({
          positions: next,
          loading: false,
          error: null,
          isMock: false,
        });
      },
      (error) => {
        console.error('[useFuturesPositions] Firestore error', error);
        setState({
          positions: [],
          loading: false,
          error,
          isMock: false,
        });
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return state;
}


