
'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { refreshInvestmentPrices } from '@/app/actions';
import type { Investment } from '@/lib/types';

type UseAutoRefreshPricesOpts = {
  userId: string | null | undefined;
  investments: Investment[];
  localIntervalMs?: number; // default 4h
  toastSilent?: boolean;
  onComplete?: () => void;
  recheckOnFocus?: boolean; // optional: re-evaluate when tab becomes visible
};

const dbg = (...a: any[]) => {
  if (process.env.NODE_ENV !== 'production') console.log('[auto-refresh]', ...a);
};

const FOCUS_DEBOUNCE_MS = 15_000;

export function useAutoRefreshPrices({
  userId,
  investments,
  localIntervalMs = 4 * 60 * 60 * 1000,
  toastSilent = false,
  onComplete,
  recheckOnFocus = true,
}: UseAutoRefreshPricesOpts) {
  const { toast } = useToast();
  const ranRef = useRef(false);
  const lastAttemptRef = useRef(0);

  useEffect(() => {
    if (!userId) { dbg('skip: no user'); return; }
    if (!investments || investments.length === 0) { dbg('skip: no investments yet'); return; }
    
    const LAST_KEY = `prices:lastRefreshAt:${userId}`;
    const RUN_KEY  = `prices:refresh:inflight:${userId}`;

    const attempt = async (reason: 'mount' | 'focus') => {
      const now = Date.now();
      if (reason === 'focus' && now - lastAttemptRef.current < FOCUS_DEBOUNCE_MS) {
        dbg('skip: focus debounce');
        return;
      }
      lastAttemptRef.current = now;

      const last = Number(localStorage.getItem(LAST_KEY) || 0);
      const shouldLocalRefresh = now - last > localIntervalMs;

      if (!shouldLocalRefresh) { dbg(`skip: local throttle (${reason})`, { last, localIntervalMs }); return; }
      if (localStorage.getItem(RUN_KEY)) { dbg('skip: inflight lock present'); return; }

      ranRef.current = true; // mark only when we actually start an attempt

      try {
        localStorage.setItem(RUN_KEY, String(now));
        if (!toastSilent) {
          toast({ title: 'Refreshing prices…', description: 'Fetching latest quotes in background.' });
        }
        dbg('start refresh', { reason });

        const res = await refreshInvestmentPrices({ userId });

        if (res?.skippedReason === 'rate_limited') {
          dbg('server rate-limited until', res.nextAllowedAt);
          if (!toastSilent) {
            toast({
              title: 'Recently refreshed',
              description: res.nextAllowedAt
                ? `Next auto-refresh after ${new Date(res.nextAllowedAt).toLocaleString()}`
                : 'Please try again later.',
            });
          }
          return;
        }

        if (res.success) {
          localStorage.setItem(LAST_KEY, String(Date.now()));
          dbg('success', { updated: res.updatedCount, failed: res.failedInvestmentNames?.length ?? 0 });

          if (!toastSilent) {
            const failed = res.failedInvestmentNames?.length ?? 0;
            toast({
              title: 'Prices refreshed',
              description: failed
                ? `${res.updatedCount} updated, ${failed} failed`
                : `${res.updatedCount} updated successfully.`,
            });
          }
          onComplete?.();
        } else {
          dbg('error result', res?.message);
          if (!toastSilent) {
            toast({ title: 'Price refresh failed', description: res.message, variant: 'destructive' });
          }
        }
      } catch (err: any) {
        dbg('exception', err?.message);
        if (!toastSilent) {
          toast({ title: 'Price refresh failed', description: err?.message || 'Please try again later.', variant: 'destructive' });
        }
      } finally {
        localStorage.removeItem(RUN_KEY);
      }
    };

    // initial attempt on mount
    if (!ranRef.current) {
        attempt('mount');
    }

    if (!recheckOnFocus) return;

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        attempt('focus');
      }
    };

    const onStorage = (e: StorageEvent) => {
        if (e.key === RUN_KEY && e.newValue) {
            dbg('saw inflight lock from another tab');
            ranRef.current = true; // ensure this tab won’t try again this mount
        }
    };

    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVis);
    
    return () => {
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('storage', onStorage);
    }
  }, [userId, investments, localIntervalMs, toastSilent, onComplete, recheckOnFocus, toast]);
}
