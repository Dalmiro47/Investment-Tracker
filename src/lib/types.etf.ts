
// src/lib/types.etf.ts
import type { Timestamp } from 'firebase/firestore';

export type ETFPlanId = string;

export interface ContributionStep {
  month: string;    // 'YYYY-MM' effective from this month (inclusive)
  amount: number;   // € per month
};

export interface ETFComponent {
  id: string;                 // auto
  name: string;               // e.g. iShares Core MSCI World
  ticker: string;             // e.g. SWDA.L or EUNL.DE (user-provided from Yahoo Finance)
  isin?: string;              // Optional, for user reference
  preferredExchange?: 'XETRA'|'LSE'|'MIL'|'AMS'; // Optional
  currency?: 'EUR'|'USD'|'GBP'|'CHF'|string;
  targetWeight: number;       // 0..1
}

export interface ETFPlan {
  id: ETFPlanId;
  title: string;
  baseCurrency: 'EUR';
  monthContribution: number;  // € per month (base amount)
  contributionSteps?: ContributionStep[]; // optional overrides
  feePct?: number;            // 0.001 = 0.1% fee per contribution (optional)
  startDate: string;          // ISO date; first month to simulate
  rebalanceOnContribution?: boolean; // if true, use contrib to steer back to targets
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface ETFPricePoint {
  symbol: string;        // resolved trading symbol (e.g. SWDA.L)
  date: string;          // ISO (month end or trading day)
  month?: string;         // 'YYYY-MM' key for alignment
  close: number;         // in instrument currency
  currency: string;      // 'GBP', 'EUR', ...
  source?: 'yahoo' | 'justetf' | 'manual';
  note?: string;
}

export interface FXRatePoint {
  date: string;          // ISO day
  month?: string;         // 'YYYY-MM' key for alignment
  base: 'EUR';
  rates: Record<string, number>; // e.g. { USD: 1.073, GBP: 0.855, ... } → EUR→CCY
}
