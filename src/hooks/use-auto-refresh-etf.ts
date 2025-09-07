
'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { refreshEtfHistoryForMonth } from '@/app/actions/etf';

type UseAutoRefreshEtfOpts = {
  userId?: string | null;
  recheckOnFocus?: boolean;
  useUTC?: boolean; // month boundary in UTC (recommended)
};

const dbg = (...a: any[]) => { if (process.env.NODE_ENV !== 'production') console.log('[etf-auto]', ...a); };
const FOCUS_DEBOUNCE_MS = 15_000;

function isFirstDay(useUTC: boolean) {
  const d = new Date();
  return useUTC ? d.getUTCDate() === 1 : d.getDate() === 1;
}

export function useAutoRefreshEtfHistory({ userId, recheckOnFocus = true, useUTC = true }: UseAutoRefreshEtfOpts) {
  const { toast } = useToast();
  const lastAttemptRef = useRef(0);

  useEffect(() => {
    if (!userId) return;

    // DEV helper: add ?etfForce to the ETF plan URL to force a run anytime
    const devForce =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('etfForce');

    const attempt = async (reason: 'mount' | 'focus') => {
      const now = Date.now();
      if (reason === 'focus' && now - lastAttemptRef.current < FOCUS_DEBOUNCE_MS) return;
      lastAttemptRef.current = now;

      if (!devForce && !isFirstDay(useUTC)) { dbg('skip: not first day'); return; }

      toast({ title: 'Refreshing ETF history…', description: 'Caching monthly series in background.' });
      dbg('start', { reason, devForce });

      const res = await refreshEtfHistoryForMonth(userId!, devForce ? { forced: true } : undefined);

      if (res.success) {
        toast({ title: 'ETF history updated', description: `${res.updatedCount ?? 0} series refreshed.` });
        dbg('success', res);
      } else if (res.skippedReason === 'not_due' || res.skippedReason === 'rate_limited') {
        dbg('skipped', res);
      } else {
        toast({ title: 'ETF history refresh failed', description: res.message, variant: 'destructive' });
        dbg('error', res);
      }
    };

    attempt('mount');

    if (!recheckOnFocus) return;
    const onVis = () => { if (document.visibilityState === 'visible') attempt('focus'); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [userId, recheckOnFocus, useUTC, toast]);
}
