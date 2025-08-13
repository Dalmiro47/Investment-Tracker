

import type { FXRatePoint } from '@/lib/types.etf';
import axios from 'axios';
import { format, eachMonthOfInterval, endOfMonth, parseISO } from 'date-fns';

const SUPPORTED_CURRENCIES = ['USD', 'JPY', 'BGN', 'CZK', 'DKK', 'GBP', 'HUF', 'PLN', 'RON', 'SEK', 'CHF', 'ISK', 'NOK', 'TRY', 'AUD', 'BRL', 'CAD', 'CNY', 'HKD', 'IDR', 'ILS', 'INR', 'KRW', 'MXN', 'MYR', 'NZD', 'PHP', 'SGD', 'THB', 'ZAR'];


export async function fetchECBMonthlyEUR(sinceISO: string): Promise<FXRatePoint[]> {
    const startDate = parseISO(sinceISO);
    const endDate = new Date();
    
    const monthEnds = eachMonthOfInterval({ start: startDate, end: endDate }).map(d => endOfMonth(d));

    const promises = monthEnds.map(async (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const url = `https://api.exchangerate.host/${dateStr}?base=EUR&symbols=${SUPPORTED_CURRENCIES.join(',')}`;
        try {
            const response = await axios.get(url);
            if (response.data?.success && response.data?.rates) {
                return {
                    date: dateStr,
                    base: 'EUR' as const,
                    rates: response.data.rates,
                };
            }
        } catch (error) {
            console.error(`Failed to fetch FX rates for ${dateStr}:`, error);
        }
        return null;
    });

    const results = await Promise.all(promises);
    return results.filter((r): r is FXRatePoint => r !== null);
}
