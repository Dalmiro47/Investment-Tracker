import { getWithRetry } from '@/lib/http';
import { format } from 'date-fns';

/**
 * Fetches the specific daily EUR exchange rate for a transaction.
 * Uses Frankfurter API (ECB data mirror).
 */
export async function getDailyEurRate(date: Date, fromCurrency: string): Promise<number> {
  // 1. Optimization: No conversion needed for EUR or simplified stablecoins
  if (fromCurrency === 'EUR') return 1;
  
  // Map common stablecoins to USD for tax estimation purposes
  const queryCurrency = (fromCurrency === 'USDT' || fromCurrency === 'USDC') ? 'USD' : fromCurrency;

  // 2. Format date (Frankfurter expects YYYY-MM-DD)
  const dateStr = format(date, 'yyyy-MM-dd');

  // 3. Construct URL
  // API Docs: https://www.frankfurter.app/docs/
  const url = `https://api.frankfurter.app/${dateStr}?from=${queryCurrency}&to=EUR`;

  try {
    const data = await getWithRetry<{ amount: number; rates: { EUR: number } }>(url);
    
    if (data && data.rates && data.rates.EUR) {
      return data.rates.EUR;
    }
    
    // If exact date fails (e.g. weekend), Frankfurter usually handles it by returning the 
    // last available business day, but if it returns null, we should handle it.
    console.warn(`[Frankfurter] No rate found for ${fromCurrency} on ${dateStr}`);
    return 0; // Trigger manual handling or fallback upstream

  } catch (error) {
    console.error(`[Frankfurter] Failed to fetch rate for ${dateStr}:`, error);
    return 0; 
  }
}
