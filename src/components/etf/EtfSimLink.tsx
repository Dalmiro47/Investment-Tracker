'use client';

import Link from 'next/link';
import { useEtfSimCache } from '@/lib/etf/sim-cache';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';
import { formatCurrency, formatPercent } from '@/lib/money';

type Props = {
  planId: string;
  symbol?: string;
  className?: string;
  showSummary?: boolean;
};

export function EtfSimLink({ planId, symbol, className, showSummary = true }: Props) {
  const { data, loading } = useEtfSimCache(planId);

  const href = `/etf/${encodeURIComponent(planId)}`;

  const chip = (label: string, tone: 'primary' | 'muted' = 'primary') => (
    <span
      className={clsx(
        'inline-flex items-center rounded-md px-2 py-[2px] text-xs',
        tone === 'primary' && 'bg-primary/15 text-primary border border-primary/20',
        tone === 'muted' && 'bg-secondary text-foreground/80 border border-border',
      )}
    >
      {label}
    </span>
  );

  if (loading) {
    return <span className={clsx('text-xs text-muted-foreground', className)}>…</span>;
  }

  if (!data) {
    return (
      <Link href={href} className={clsx('inline-flex items-center gap-2', className)}>
        {chip('Run simulation', 'muted')}
      </Link>
    );
  }

  const date = format(parseISO(data.lastRunAt), 'dd/MM/yyyy');
  const perf = formatPercent(data.lifetime.performance);
  const finalValue = formatCurrency(data.lifetime.marketValue);

  return (
    <Link href={href} className={clsx('inline-flex items-center gap-2', className)}>
      {chip('View Plan')}
      {showSummary && (
        <span className="text-xs text-muted-foreground">
          {`Last: ${date} · Perf ${perf} · ${finalValue}`}
        </span>
      )}
    </Link>
  );
}
