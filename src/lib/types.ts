export type InvestmentType = 'Stock' | 'Bond' | 'Crypto' | 'Real Estate';

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
