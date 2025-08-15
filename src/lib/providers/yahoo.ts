
import type { ETFPricePoint } from '@/lib/types.etf';
import { http } from '@/lib/http';
import { format, parseISO, startOfMonth } from 'date-fns';

const defaultTickerMap: Record<string, Record<string, string>> = {
    // Mappings based on user's configuration
    'IE00B4L5Y983': { 'XETRA': 'EUNL.DE' }, // MSCI World
    'IE00BKM4GZ66': { 'XETRA': 'IS3N.DE' }, // Emerging Markets
    'IE00B52MJY50': { 'XETRA': 'SXR1.DE' }, // Pacific ex-Japan
    'IE00B4K48X80': { 'XETRA': 'EUNK.DE' }, // MSCI Europe
};


export function defaultTickerForISIN(isin: string, exch: 'XETRA' | 'LSE' | 'MIL' | 'AMS' = 'XETRA'): string {
    if (!isin) return '';
    const m = defaultTickerMap[isin]; 
    if (!m) return '';
    return m[exch] ?? Object.values(m)[0] ?? '';
}

export async function fetchYahooMonthly(symbol: string, sinceISO: string): Promise<ETFPricePoint[]> {
    if (!symbol) return [];
    
    // Convert ISO start date to a UNIX timestamp for the API
    const period1 = Math.floor(startOfMonth(parseISO(sinceISO)).getTime() / 1000);
    // Use current date as the end timestamp
    const period2 = Math.floor(new Date().getTime() / 1000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1mo`;

    try {
        const response = await http.get(url);
        const result = response.data?.chart?.result?.[0];
        if (!result) {
            console.warn(`No chart data found for symbol: ${symbol}`);
            return [];
        }

        const { timestamp, indicators } = result;
        const adjclose = indicators?.adjclose?.[0]?.adjclose;
        const currency = result.meta?.currency;

        if (!timestamp || !adjclose || !currency) {
            console.warn(`Incomplete data for symbol: ${symbol}`);
            return [];
        }

        const sinceDate = parseISO(sinceISO);
        const pricePoints: ETFPricePoint[] = [];

        for (let i = 0; i < timestamp.length; i++) {
            const date = new Date(timestamp[i] * 1000);
            if (date >= startOfMonth(sinceDate) && adjclose[i] !== null) {
                pricePoints.push({
                    symbol,
                    date: format(date, 'yyyy-MM-dd'),
                    close: adjclose[i],
                    currency,
                });
            }
        }
        return pricePoints;
    } catch (error) {
        console.error(`Failed to fetch Yahoo Finance data for ${symbol}:`, error);
        return [];
    }
}

export async function fetchYahooLast(symbol: string): Promise<ETFPricePoint | null> {
    if (!symbol) return null;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`;
    try {
        const { data } = await http.get(url);
        const result = data?.chart?.result?.[0];
        if (!result) return null;
        const { timestamp, indicators, meta } = result;
        const closes = indicators?.adjclose?.[0]?.adjclose ?? indicators?.quote?.[0]?.close;
        if (!timestamp || !closes) return null;

        for (let i = timestamp.length - 1; i >= 0; i--) {
            if (closes[i] != null) {
                const d = new Date(timestamp[i] * 1000);
                return { symbol, date: format(d, 'yyyy-MM-dd'), close: closes[i], currency: meta?.currency ?? 'EUR' };
            }
        }
        return null;
    } catch {
        return null;
    }
}
