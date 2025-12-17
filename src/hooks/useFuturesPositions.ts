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
   * When omitted and `useMockData` is true, the hook will only return mock data.
   */
  userId?: string | null;
  /**
   * When true, the hook returns a deterministic set of mock positions instead of
   * reading from Firestore. This is useful while wiring up UI without a live data source.
   */
  useMockData?: boolean;
};

type UseFuturesPositionsState = {
  positions: FuturePosition[];
  loading: boolean;
  error: FirestoreError | null;
  isMock: boolean;
};

const FUTURES_COLLECTION = 'futures_positions';

// --- Temporary mock data ----------------------------------------------------

function buildMockFuturesPositions(userId?: string | null): FuturePosition[] {
  const baseOpened = Timestamp.fromDate(new Date('2025-01-02T09:30:00Z'));

  return [
    {
      id: 'mock-long-eth-perp',
      asset: 'ETH/USD Perp',
      side: 'LONG',
      leverage: 5,
      entryPrice: 2400,
      markPrice: 2550,
      liquidationPrice: 1800,
      collateral: 500, // margin posted in account currency
      size: 6000, // notional
      unrealizedPnL: 150, // simplified for demo
      accumulatedFunding: -12.5,
      status: 'OPEN',
      openedAt: baseOpened,
      closedAt: null,
    },
    {
      id: 'mock-short-btc-perp',
      asset: 'BTC/USD Perp',
      side: 'SHORT',
      leverage: 3,
      entryPrice: 65000,
      markPrice: 63000,
      liquidationPrice: 72000,
      collateral: 1000,
      size: 15000,
      unrealizedPnL: 450,
      accumulatedFunding: 22.1,
      status: 'OPEN',
      openedAt: Timestamp.fromDate(new Date('2025-01-10T14:00:00Z')),
      closedAt: null,
    },
  ].map((p) => ({
    ...p,
    // In a real schema you might also persist the owner / account id.
    // We keep the mock minimal and owner-agnostic for now.
  }));
}

// --- Hook -------------------------------------------------------------------

export function useFuturesPositions(
  opts: UseFuturesPositionsOptions = {}
): UseFuturesPositionsState {
  const { userId, useMockData = false } = opts;
  const [state, setState] = useState<UseFuturesPositionsState>({
    positions: [],
    loading: true,
    error: null,
    isMock: false,
  });

  useEffect(() => {
    // Pure mock mode – never touch Firestore.
    if (useMockData) {
      const mock = buildMockFuturesPositions(userId);
      setState({
        positions: mock,
        loading: false,
        error: null,
        isMock: true,
      });
      return;
    }

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

    // Read the per-user futures positions subcollection so Firestore rules match
    const colRef = collection(db, 'users', userId!, FUTURES_COLLECTION);
    const q = query(colRef, orderBy('openedAt', 'desc'));

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
  }, [userId, useMockData]);

  return state;
}


