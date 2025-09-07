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

  useEffect(() => {
    if (!userId) { dbg('skip: no user'); return; }
    if (!investments || investments.length === 0) { dbg('skip: no investments yet'); return; }
    if (ranRef.current) { dbg('skip: already attempted this mount'); return; }

    const LAST_KEY = `prices:lastRefreshAt:${userId}`;
    const RUN_KEY  = `prices:refresh:inflight:${userId}`;

    const attempt = async (reason: 'mount' | 'focus') => {
      const now = Date.now();
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

        const res = await refreshInvestmentPrices(investments, { userId });

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
          // Optional: mark local timestamp so we don’t try again immediately on every route visit
          // localStorage.setItem(LAST_KEY, String(Date.now()));
          return;
        }

        if (res.success) {
          localStorage.setItem(LAST_KEY, String(Date.now()));
          dbg('success', { updated: res.updatedInvestments.length, failed: res.failedInvestmentNames?.length ?? 0 });

          if (!toastSilent) {
            const failed = res.failedInvestmentNames?.length ?? 0;
            toast({
              title: 'Prices refreshed',
              description: failed
                ? `${res.updatedInvestments.length} updated, ${failed} failed`
                : `${res.updatedInvestments.length} updated successfully.`,
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
    attempt('mount');

    // optional: re-check when user returns to the tab (good DX)
    if (!recheckOnFocus) return;

    const onVis = () => {
      if (document.visibilityState === 'visible' && !ranRef.current) {
        attempt('focus');
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [userId, investments, localIntervalMs, toastSilent, onComplete, recheckOnFocus, toast]);
}
