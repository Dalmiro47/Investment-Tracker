'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';

export type EtfSimCache = {
  planId: string;
  title: string;
  lastRunAt: string;        // ISO
  lifetime: {
    marketValue: number;
    performance: number;
  }
};

export function useEtfSimCache(planId?: string) {
  const { user } = useAuth();
  const [data, setData] = useState<EtfSimCache | null>(null);
  const [loading, setLoading] = useState(!!planId);

  useEffect(() => {
    if (!planId || !user?.uid) {
      setLoading(false);
      return;
    };
    const ref = doc(db, 'users', user.uid, 'etfPlans', planId, 'latest_sim_summary', 'latest');
    const unsub = onSnapshot(ref, (snap) => {
      setData((snap.exists() ? ({ planId, ...(snap.data() as DocumentData) }) : null) as EtfSimCache | null);
      setLoading(false);
    });
    return unsub;
  }, [planId, user?.uid]);

  return { data, loading };
}
