// src/lib/types.etf.ts
export type ETFPlanId = string;

export interface ETFComponent {
  id: string;                 // auto
  name: string;               // e.g. iShares Core MSCI World
  isin: string;               // IE00B4K48X80
  preferredExchange?: 'XETRA'|'LSE'|'MIL'|'AMS';
  ticker?: string;            // e.g. SWDA.L or EUNL.DE (preferred)
  currency?: 'EUR'|'USD'|'GBP'|'CHF'|string;
  targetWeight: number;       // 0..1
}

export interface ETFPlan {
  id: ETFPlanId;
  title: string;
  baseCurrency: 'EUR';
  monthContribution: number;  // € per month
  feePct?: number;            // 0.001 = 0.1% fee per contribution (optional)
  startDate: string;          // ISO date; first month to simulate
  rebalanceOnContribution?: boolean; // if true, use contrib to steer back to targets
  createdAt: string;
  updatedAt: string;
}

export interface ETFPricePoint {
  symbol: string;        // resolved trading symbol (e.g. SWDA.L)
  date: string;          // ISO (month end or trading day)
  close: number;         // in instrument currency
  currency: string;      // 'GBP', 'EUR', ...
}

export interface FXRatePoint {
  date: string;          // ISO day
  base: 'EUR';
  rates: Record<string, number>; // e.g. { USD: 1.073, GBP: 0.855, ... } → EUR→CCY
}
