
'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { refreshEtfHistoryForMonth } from '@/app/actions/etf';

type UseAutoRefreshEtfOpts = {
  userId?: string | null;
  recheckOnFocus?: boolean;
  useUTC?: boolean; // default true
};

function isFirstDay(useUTC = true) {
  const d = new Date();
  return useUTC ? d.getUTCDate() === 1 : d.getDate() === 1;
}

const FOCUS_DEBOUNCE_MS = 15_000;

export function useAutoRefreshEtfHistory({ userId, recheckOnFocus = true, useUTC = true }: UseAutoRefreshEtfOpts) {
  const { toast } = useToast();
  const lastAttemptRef = useRef(0);

  useEffect(() => {
    if (!userId) return;

    const attempt = async (reason: 'mount' | 'focus') => {
      const now = Date.now();
      if (reason === 'focus' && now - lastAttemptRef.current < FOCUS_DEBOUNCE_MS) return;
      lastAttemptRef.current = now;

      if (!isFirstDay(useUTC)) return; // only run on day 1

      toast({ title: 'Refreshing ETF history…', description: 'Caching monthly series in background.' });

      const res = await refreshEtfHistoryForMonth(userId);
      if (res.success) {
        toast({ title: 'ETF history updated', description: `${res.updatedCount ?? 0} series refreshed.` });
      } else if (res.skippedReason === 'not_due') {
        // quiet – it means we already refreshed this month
      } else if (res.skippedReason === 'rate_limited') {
        // quiet – just a short cooldown
      } else {
        toast({ title: 'ETF history refresh failed', description: res.message, variant: 'destructive' });
      }
    };

    attempt('mount');

    if (!recheckOnFocus) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') attempt('focus');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [userId, recheckOnFocus, useUTC, toast]);
}
