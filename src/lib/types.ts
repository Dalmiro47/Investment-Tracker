
import { z } from 'zod';

export type InvestmentType = 'Stock' | 'Bond' | 'Crypto' | 'Real Estate' | 'ETF' | 'Savings';
export type InvestmentStatus = 'Active' | 'Sold';
export type SortKey = 'purchaseDate' | 'performance' | 'totalAmount';

export type TransactionType = 'Sell' | 'Dividend' | 'Interest';

export type YearFilter = { kind: 'all' } | { kind: 'year'; year: number };


export interface Transaction {
  id: string;
  type: TransactionType;
  date: string;          // ISO
  quantity: number;      // for Sell; 0 for Div/Interest
  pricePerUnit: number;  // for Sell; 0 for Div/Interest
  totalAmount: number;   // quantity * pricePerUnit (Sell) or payment amount (Div/Int)
}

export interface Investment {
  id: string;
  name: string;
  type: InvestmentType;
  ticker?: string;

  // SINGLE purchase
  purchaseDate: string;          // ISO
  purchaseQuantity: number;      // your initial qty (one-time)
  purchasePricePerUnit: number;  // your initial price per unit

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

  // --- DEPRECATED ---
  // Kept for backwards compatibility during transition if needed, but new logic should not use them.
  initialValue?: number;
  quantity?: number;
}


// Schema for adding/editing a new investment (the initial purchase)
export const investmentSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  type: z.enum(['Stock', 'Bond', 'Crypto', 'Real Estate', 'ETF', 'Savings']),
  ticker: z.string().optional(),
  purchaseDate: z.date({ required_error: "Purchase date is required." }),
  purchaseQuantity: z.coerce.number().positive({ message: "Quantity must be positive." }),
  purchasePricePerUnit: z.coerce.number().nonnegative({ message: "Purchase price must be zero or more." }),
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
  type: z.enum(['Sell', 'Dividend', 'Interest']),
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
  if ((data.type === 'Dividend' || data.type === 'Interest') && data.amount <= 0) {
     ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Amount must be positive for Dividends or Interest.",
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
