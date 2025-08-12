
import { z } from 'zod';

export type InvestmentType = 'Stock' | 'Bond' | 'Crypto' | 'Real Estate' | 'ETF' | 'Savings';

export type InvestmentStatus = 'Active' | 'Sold';

export type SortKey = 'purchaseDate' | 'performance' | 'totalAmount';

export type TransactionType = 'Buy' | 'Sell' | 'Dividend' | 'Interest';

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string; // ISO 8601 format
  quantity: number;
  pricePerUnit: number;
  totalAmount: number;
}

export interface Investment {
  id: string;
  name: string;
  type: InvestmentType;
  ticker?: string;
  // Aggregated values from transactions
  totalQuantity: number; // This might be deprecated by just 'quantity'
  totalCost: number;
  totalSaleValue?: number; // Total value from all sales
  averageBuyPrice: number;
  currentValue: number | null; // Current market price per unit
  status: InvestmentStatus; 
  dividends?: number; // Sum of all dividend transactions
  interest?: number; // Sum of all interest transactions
  // Original fields, kept for initial buy transaction and backwards compatibility
  purchaseDate: string; 
  initialValue: number; 
  quantity: number; 
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
    type: z.enum(['Sell', 'Dividend', 'Interest']),
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
});
export type OldInvestmentFormValues = z.infer<typeof oldInvestmentSchema>;
