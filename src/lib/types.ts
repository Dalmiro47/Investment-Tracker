import { z } from 'zod';

export type InvestmentType = 'Stock' | 'Bond' | 'Crypto' | 'Real Estate' | 'ETF' | 'Savings';

export type InvestmentStatus = 'Active' | 'Sold';

export type SortKey = 'purchaseDate' | 'performance' | 'totalAmount';

export interface Investment {
  id: string;
  name: string;
  type: InvestmentType;
  status: InvestmentStatus;
  purchaseDate: string; // ISO 8601 format
  initialValue: number; // Price per unit at purchase
  currentValue: number; // Current price per unit
  quantity: number;
  dividends: number;
  interest: number;
}

export const investmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  type: z.enum(['Stock', 'Bond', 'Crypto', 'Real Estate', 'ETF', 'Savings']),
  status: z.enum(['Active', 'Sold']),
  purchaseDate: z.date(),
  initialValue: z.coerce.number().min(0, { message: 'Initial value must be positive.' }),
  currentValue: z.coerce.number().min(0, { message: 'Current value must be positive.' }),
  quantity: z.coerce.number().min(0, { message: 'Quantity must be positive.' }),
  dividends: z.coerce.number().min(0, { message: 'Dividends must be positive.' }).optional().default(0),
  interest: z.coerce.number().min(0, { message: 'Interest must be positive.' }).optional().default(0),
});

export type InvestmentFormValues = z.infer<typeof investmentSchema>;
