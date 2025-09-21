
'use client';

import { useEffect, useRef, useMemo } from 'react';
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
  const lastAttemptRef = useRef(0);

  const invKey = useMemo(
    () => (investments ?? []).map((i) => i.id).join("|"),
    [investments]
  );

  useEffect(() => {
    let cancelled = false;

    const attempt = async (reason: 'mount' | 'focus') => {
      // Early outs are inside the effect
      if (!userId) { dbg('skip: no user'); return; }
      if (!investments || investments.length === 0) { dbg('skip: no investments yet'); return; }

      const now = Date.now();
      if (reason === 'focus' && now - lastAttemptRef.current < FOCUS_DEBOUNCE_MS) {
        dbg('skip: focus debounce');
        return;
      }
      lastAttemptRef.current = now;
      
      const LAST_KEY = `prices:lastRefreshAt:${userId}`;
      const RUN_KEY  = `prices:refresh:inflight:${userId}`;

      const last = Number(localStorage.getItem(LAST_KEY) || 0);
      const shouldLocalRefresh = now - last > localIntervalMs;

      if (!shouldLocalRefresh) { dbg(`skip: local throttle (${reason})`, { last, localIntervalMs }); return; }
      if (localStorage.getItem(RUN_KEY)) { dbg('skip: inflight lock present'); return; }

      try {
        localStorage.setItem(RUN_KEY, String(now));
        if (!toastSilent) {
          toast({ title: 'Refreshing prices…', description: 'Fetching latest quotes in background.' });
        }
        dbg('start refresh', { reason });

        const res = await refreshInvestmentPrices({ userId });
        
        if (cancelled) return;

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
        if (!toastSilent && !cancelled) {
          toast({ title: 'Price refresh failed', description: err?.message || 'Please try again later.', variant: 'destructive' });
        }
      } finally {
        localStorage.removeItem(RUN_KEY);
      }
    };

    attempt('mount');

    let onVis: (() => void) | undefined;
    let onStorage: ((e: StorageEvent) => void) | undefined;

    if (recheckOnFocus) {
      onVis = () => {
        if (document.visibilityState === 'visible') {
          attempt('focus');
        }
      };

      onStorage = (e: StorageEvent) => {
          if (e.key === `prices:refresh:inflight:${userId}` && e.newValue) {
              dbg('saw inflight lock from another tab');
          }
      };

      window.addEventListener('storage', onStorage);
      document.addEventListener('visibilitychange', onVis);
    }
    
    return () => {
      cancelled = true;
      if (onVis) document.removeEventListener('visibilitychange', onVis);
      if (onStorage) window.removeEventListener('storage', onStorage);
    }
  }, [userId, invKey, localIntervalMs, toastSilent, onComplete, recheckOnFocus, toast]);
}
