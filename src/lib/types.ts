import { z } from 'zod';

export type InvestmentType = 'Stock' | 'Bond' | 'Crypto' | 'Real Estate' | 'ETF' | 'Savings';

export type InvestmentStatus = 'Active' | 'Sold';

export type SortKey = 'purchaseDate' | 'performance' | 'totalAmount';

export type TransactionType = 'Buy' | 'Sell' | 'Dividend' | 'Interest';

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string; // ISO 8601 format
  quantity: number; // Can be negative for 'Sell'
  pricePerUnit: number;
  totalAmount: number;
}

export interface Investment {
  id: string;
  name: string;
  type: InvestmentType;
  ticker?: string;
  // Aggregated values from transactions
  totalQuantity: number;
  totalCost: number;
  averageBuyPrice: number;
  currentValue: number | null; // Current market price per unit
  // Direct fields
  status: InvestmentStatus; // This could be derived from totalQuantity
  dividends?: number; // Might be replaced by Dividend transactions
  interest?: number; // Might be replaced by Interest transactions
  // Deprecated fields, to be removed later
  purchaseDate: string; // Will be replaced by first transaction date
  initialValue: number; // Will be replaced by averageBuyPrice
  quantity: number; // Will be replaced by totalQuantity
}

// Schema for adding/editing the main investment properties
export const investmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  type: z.enum(['Stock', 'Bond', 'Crypto', 'Real Estate', 'ETF', 'Savings']),
  ticker: z.string().optional(),
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

// Schema for adding a new transaction
export const transactionSchema = z.object({
    type: z.enum(['Buy', 'Sell', 'Dividend', 'Interest']),
    date: z.date(),
    quantity: z.coerce.number().min(0.000001, { message: 'Quantity must be greater than 0.' }),
    pricePerUnit: z.coerce.number().min(0, { message: 'Price must be positive.' }),
});
export type TransactionFormValues = z.infer<typeof transactionSchema>;

// --- DEPRECATED --- Will be replaced by new logic
export const oldInvestmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  type: z.enum(['Stock', 'Bond', 'Crypto', 'Real Estate', 'ETF', 'Savings']),
  status: z.enum(['Active', 'Sold']),
  purchaseDate: z.date(),
  initialValue: z.coerce.number().min(0, { message: 'Initial value must be positive.' }),
  currentValue: z.coerce.number().min(0, { message: 'Value must be positive.' }).nullable(),
  quantity: z.coerce.number().min(0.000001, { message: 'Quantity must be greater than 0.' }),
  dividends: z.coerce.number().min(0, { message: 'Dividends must be positive.' }).optional().default(0),
  interest: z.coerce.number().min(0, { message: 'Interest must be positive.' }).optional().default(0),
  ticker: z.string().optional(),
}).superRefine((data, ctx) => {
    const tickerRequiredTypes: InvestmentType[] = ['Stock', 'ETF', 'Crypto'];
    if (tickerRequiredTypes.includes(data.type) && (!data.ticker || data.ticker.trim() === '')) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Ticker is required for this investment type.",
            path: ["ticker"],
        });
    }
    if (data.status === 'Sold' && (data.currentValue === null || data.currentValue === undefined)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Sold value is required when status is 'Sold'.",
            path: ["currentValue"],
        });
    }
});
export type OldInvestmentFormValues = z.infer<typeof oldInvestmentSchema>;