import { z } from 'zod';
import type { Timestamp } from 'firebase/firestore';

export type InvestmentType = 'Stock' | 'Bond' | 'Crypto' | 'Future' | 'Real Estate' | 'ETF' | 'Interest Account';
export type InvestmentStatus = 'Active' | 'Sold';
export type SortKey = 'purchaseDate' | 'performance' | 'totalAmount';

export type TransactionType = 'Buy' | 'Sell' | 'Dividend' | 'Interest' | 'Deposit' | 'Withdrawal';

export type ViewMode = 'combined' | 'realized' | 'holdings';

export type YearFilter =
  | { kind: 'all'; mode: ViewMode }
  | { kind: 'year'; year: number; mode: ViewMode };

export interface AggregatedSummary {
  rows: {
    type: string;
    costBasis: number;
    marketValue: number;
    realizedPL: number;
    unrealizedPL: number;
    totalPL: number;
    performancePct: number;
    economicValue: number;
  }[];
  totals: {
    costBasis: number;
    marketValue: number;
    realizedPL: number;
    unrealizedPL: number;
    totalPL: number;
    performancePct: number;
    economicValue: number;
  };
  taxSummary: any;
  futuresTransactions?: any[];
}

export interface TaxSettings {
  churchTaxRate: 0 | 0.08 | 0.09;
  filingStatus: 'single' | 'married';
  cryptoMarginalRate: number; // Storing as a number, e.g., 0.30 for 30%
}

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string;          // ISO
  quantity: number;      // for Sell; 0 for Div/Interest
  pricePerUnit: number;  // for Sell; 0 for Div/Interest
  totalAmount: number;   // quantity * pricePerUnit (Sell) or payment amount (Div/Int)
  currency?: string;     // 'USD', 'EUR', etc.
  exchangeRate?: number; // e.g. 0.92 (EUR/USD rate on that day)
  valueInEur?: number;   // e.g. 27,600 (The totalAmount converted to EUR)
}

export interface Investment {
  id: string;
  name: string;
  type: InvestmentType;
  ticker?: string;
  exchange?: string;
  planId?: string; // For linking manual ETF entries to a savings plan

  // SINGLE purchase
  purchaseDate: string;          // ISO
  purchaseQuantity: number;      // your initial qty (one-time)
  purchasePricePerUnit: number;  // your initial price per unit
  
  // For Crypto tax rule
  stakingOrLending?: boolean;

  // Market data
  currentValue: number | null;   // live price per unit

  // Derived/aggregated (from transactions)
  totalSoldQty: number;          // sum of all sell quantities
  realizedProceeds: number;      // sum of all sell totalAmount
  realizedPnL: number;           // sum over sells: (sellPrice - purchasePrice) * qty
  dividends: number;             // optional cumulated via transactions
  interest: number;              // optional cumulated via transactions
  status: InvestmentStatus;      // Active if availableQty > 0, else Sold

  createdAt?: string;
  updatedAt?: string;
}

/**
 * Futures / Derivatives position (Tax bucket: §20 Kapitalerträge)
 * Kept separate from `Investment` because the mechanics (leverage, funding, liquidation)
 * and tax treatment differ from spot assets (§23 private sales).
 */
export interface FuturePosition {
  id: string;

  // Instrument & direction
  ticker?: string;               // e.g. "ETH-PERP" (for filtering, optional for backwards compat)
  asset: string;                 // e.g. "ETH" or "ETH/USD Perp"
  side: 'LONG' | 'SHORT';

  // Risk parameters
  leverage: number;              // e.g. 5 for 5x
  entryPrice: number;            // average entry price
  markPrice: number;             // current mark/index price
  liquidationPrice: number;      // broker‑calculated liquidation level

  // Margin & size
  collateral: number;            // margin posted for this position (in account currency)
  size: number;                  // notional size of the contract (same units as asset quote)

  // PnL & funding
  unrealizedPnL: number;         // current floating PnL (can be negative)
  accumulatedFunding: number;    // net paid/received funding over lifetime (for §20)
  fundingEur?: number;           // optional: funding converted to EUR for tax reporting
  feePaidEur?: number;           // optional: fee amount converted to EUR for tax reporting
  feeUsd?: number;               // optional: fee amount in USD from Kraken
  feeEur?: number;               // optional: fee amount in EUR converted for tax reporting
  realizedPnL?: number;          // optional realized PnL when position is closed
  realizedPnlEur?: number;       // optional realized PnL in EUR
  exitPrice?: number;            // optional exit price for closed trades (from account log)

  // Lifecycle
  status: 'OPEN' | 'CLOSED' | 'LIQUIDATED';
  openedAt: Timestamp;           // when the position was opened
  closedAt?: Timestamp | null;   // optional close/liquidation time

  exchangeRate: number;            // conversion rate to EUR
}

export interface EtfSimYearBucket {
  year: number;
  contrib: number;
  fees: number;
  endValue: number;
  endDate: string | null;
  cumContribToDate: number;
  unrealizedPL: number;
  performance: number;
};

export interface EtfSimSummary {
  planId: string;
  title: string;
  baseCurrency: 'EUR';
  startMonth: string;
  endMonth: string;
  lastRunAt: string; // ISO
  lifetime: {
    contrib: number;
    fees: number;
    marketValue: number;
    unrealizedPL: number;
    performance: number;
  };
  byYear: Record<string, EtfSimYearBucket>;
};


// Schema for adding/editing a new investment (the initial purchase)
export const investmentSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  type: z.enum(['Stock', 'Bond', 'Crypto', 'Real Estate', 'ETF', 'Interest Account']),
  ticker: z.string().optional(),
  exchange: z.string().optional(),
  planId: z.string().optional(),
  purchaseDate: z.date({ required_error: "Purchase date is required." }),
  purchaseQuantity: z.coerce.number().nonnegative(),
  purchasePricePerUnit: z.coerce.number().nonnegative(),
  stakingOrLending: z.boolean().optional(),
}).superRefine((data, ctx) => {
    const tickerRequiredTypes: InvestmentType[] = ['Stock', 'ETF', 'Crypto'];
    if (tickerRequiredTypes.includes(data.type) && (!data.ticker || data.ticker.trim() === '')) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Ticker is required for this investment type.",
            path: ["ticker"],
        });
    }
});
export type InvestmentFormValues = z.infer<typeof investmentSchema>;


// Schema for adding a new transaction (Sell, Dividend, or Interest)
export const transactionSchema = z.object({
  type: z.enum(['Sell', 'Dividend', 'Interest', 'Deposit', 'Withdrawal']),
  date: z.date({ required_error: "Date is required." }),
  quantity: z.coerce.number().nonnegative().default(0),
  pricePerUnit: z.coerce.number().nonnegative().default(0),
  amount: z.coerce.number().nonnegative().default(0), // For Dividends/Interest
}).superRefine((data, ctx) => {
  if (data.type === 'Sell' && data.quantity <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Sell quantity must be positive.",
      path: ["quantity"],
    });
  }
  if ((data.type === 'Dividend' || data.type === 'Interest' || data.type === 'Deposit' || data.type === 'Withdrawal') && data.amount <= 0) {
     ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Amount must be positive.",
      path: ["amount"],
    });
  }
});
export type TransactionFormValues = z.infer<typeof transactionSchema>;


// --- HELPERS ---
export function availableQty(inv: Investment): number {
  return Math.max(0, inv.purchaseQuantity - inv.totalSoldQty);
}

export function unrealizedPnL(inv: Investment): number | null {
  if (inv.currentValue === null) return null;
  const avQty = availableQty(inv);
  return (inv.currentValue - inv.purchasePricePerUnit) * avQty;
}

export function performancePct(inv: Investment): number {
    const avQty = availableQty(inv);
    // Cost basis is the original purchase price of the remaining shares
    const costBasis = inv.purchasePricePerUnit * avQty;
    // Total cost is the original purchase price of all shares ever bought
    const totalCost = inv.purchasePricePerUnit * inv.purchaseQuantity;

    if (totalCost === 0) return 0;

    // Current market value of remaining shares
    const marketValue = inv.currentValue !== null ? inv.currentValue * avQty : 0;
    
    // Total value = what I got from selling + what I have left
    const totalValue = inv.realizedProceeds + marketValue;
    
    return (totalValue - totalCost) / totalCost;
}
