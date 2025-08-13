
import type { ETFPricePoint } from '@/lib/types.etf';
import axios from 'axios';
import { format, parse, startOfMonth } from 'date-fns';

const defaultTickerMap: Record<string, Record<string, string>> = {
    'IE00B4K48X80': { 'LSE': 'SWDA.L', 'XETRA': 'EUNL.DE' }, // MSCI World
    'IE00B52MJY50': { 'LSE': 'EIMI.L' },                   // EM IMI
    'IE00B4L5Y983': { 'LSE': 'IMEU.L' },                   // Europe
    'IE00BKM4GZ66': { 'LSE': 'CPXJ.L' }                    // Pacific ex-JP
};

export function defaultTickerForISIN(isin: string, exch: 'XETRA' | 'LSE' = 'LSE'): string {
    return defaultTickerMap[isin]?.[exch] ?? '';
}

export async function fetchYahooMonthly(symbol: string, sinceISO: string): Promise<ETFPricePoint[]> {
    if (!symbol) return [];

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1mo&range=10y`;

    try {
        const response = await axios.get(url);
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

    // We can reuse the monthly fetch and just take the last point.
    // A dedicated '1d' fetch could also work but might be less efficient if called with monthly.
    try {
        const monthlyData = await fetchYahooMonthly(symbol, format(new Date(), 'yyyy-MM-dd'));
        if (monthlyData.length > 0) {
            return monthlyData[monthlyData.length - 1];
        }
        return null;
    } catch (error) {
        console.error(`Failed to fetch last price for ${symbol}:`, error);
        return null;
    }
}
