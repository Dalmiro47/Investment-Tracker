
'use client';

import { useEffect, useRef } from 'react';
import { useToast } from "@/hooks/use-toast";
import { refreshInvestmentPrices } from '@/app/actions';
import type { Investment } from '@/lib/types';

type UseAutoRefreshPricesOpts = {
  userId: string | null | undefined;
  investments: Investment[];
  localIntervalMs?: number;
  toastSilent?: boolean;
  onComplete?: () => void;
};

export function useAutoRefreshPrices({
  userId,
  investments,
  localIntervalMs = 4 * 60 * 60 * 1000, // 4 hours
  toastSilent = false,
  onComplete,
}: UseAutoRefreshPricesOpts) {
  const { toast } = useToast();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!userId || !investments || investments.length === 0) return;
    if (ranRef.current) return;
    ranRef.current = true;

    const LAST_KEY = `prices:lastRefreshAt:${userId}`;
    const RUNNING_KEY = `prices:refresh:inflight:${userId}`;
    const now = Date.now();
    const last = Number(localStorage.getItem(LAST_KEY) || 0);
    const shouldLocalRefresh = now - last > localIntervalMs;

    if (!shouldLocalRefresh || localStorage.getItem(RUNNING_KEY)) return;

    const bc = 'BroadcastChannel' in window ? new BroadcastChannel('prices_refresh') : null;

    const doRefresh = async () => {
      try {
        localStorage.setItem(RUNNING_KEY, String(now));
        if (!toastSilent) {
          toast({ title: 'Refreshing prices…', description: 'Fetching latest quotes in background.' });
        }
        
        const res = await refreshInvestmentPrices(investments, { userId: userId });
        
        if (res?.success === false && res.message.includes('rate_limited')) {
            // Note: server now returns success:false for rate limit, so we check message
            // This part might need adjustment based on final server action response shape
        } else if (res.success) {
            localStorage.setItem(LAST_KEY, String(Date.now()));
            if (!toastSilent) {
                toast({
                    title: `Prices refreshed`,
                    description: res.failedInvestmentNames?.length
                        ? `${res.updatedInvestments.length} updated, ${res.failedInvestmentNames.length} failed`
                        : `${res.updatedInvestments.length} updated successfully.`,
                });
            }
            onComplete?.();
        } else {
             if (!toastSilent) {
                toast({ title: 'Price refresh failed', description: res.message, variant: 'destructive' });
            }
        }
      } catch (err: any) {
        if (!toastSilent) {
          toast({ title: 'Price refresh failed', description: err?.message || 'Please try again later.', variant: 'destructive' });
        }
      } finally {
        localStorage.removeItem(RUNNING_KEY);
      }
    };

    doRefresh();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.source === 'manual-refresh-hook' && event.data.type === 'complete') {
        onComplete?.();
      }
    };

    bc?.addEventListener('message', handleMessage);

    return () => {
      bc?.removeEventListener('message', handleMessage);
      bc?.close();
    };
  }, [userId, investments, localIntervalMs, toastSilent, onComplete, toast]);
}
