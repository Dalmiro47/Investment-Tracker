
export type SavingsTransaction = {
  date: string;         // 'YYYY-MM-DD' (local, end-exclusive handling below)
  amount: number;       // +deposit, -withdrawal
  note?: string;
};

export type SavingsRateChange = {
  from: string;         // 'YYYY-MM-DD' inclusive
  annualRatePct: number;  // e.g., 2 means 2%
};

export type SavingsAccrualMode = 'DAILY_COMPOUND_ACT365';
