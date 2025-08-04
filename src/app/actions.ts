'use server';

import type { Investment } from '@/lib/types';
import axios from 'axios';

interface UpdateResult {
  success: boolean;
  message: string;
  updatedInvestments: Investment[];
}

// Fetches price from Yahoo Finance for Stocks/ETFs
async function getStockPrice(ticker: string): Promise<number | null> {
  if (!ticker) return null;
  try {
    const response = await axios.get(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`);
    const result = response.data.quoteResponse.result[0];
    if (result && result.regularMarketPrice) {
      // NOTE: This doesn't convert currency. Assumes the ticker is priced in EUR (e.g., NVD.F for Frankfurt)
      return result.regularMarketPrice;
    }
    return null;
  } catch (error) {
    console.warn(`Failed to fetch price for stock/ETF ticker: ${ticker}`, error);
    return null;
  }
}

// Fetches price from CoinGecko for Crypto
async function getCryptoPrice(id: string): Promise<number | null> {
  if (!id) return null;
  try {
    const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${id.toLowerCase()}&vs_currencies=eur`);
    const price = response.data[id.toLowerCase()]?.eur;
    return price || null;
  } catch (error) {
    console.warn(`Failed to fetch price for crypto ID: ${id}`, error);
    return null;
  }
}

export async function refreshInvestmentPrices(currentInvestments: Investment[]): Promise<UpdateResult> {
  try {
    let updatedCount = 0;
    let failedCount = 0;

    const updatedInvestments = [...currentInvestments];

    const priceFetchPromises = updatedInvestments.map(async (inv, index) => {
      let newPrice: number | null = null;
      if ((inv.type === 'Stock' || inv.type === 'ETF') && inv.ticker) {
        newPrice = await getStockPrice(inv.ticker);
      } else if (inv.type === 'Crypto' && inv.ticker) {
        newPrice = await getCryptoPrice(inv.ticker);
      }

      if (newPrice !== null && newPrice !== inv.currentValue) {
        updatedInvestments[index].currentValue = newPrice;
        updatedCount++;
      } else if (newPrice === null && (inv.type === 'Stock' || inv.type === 'ETF' || inv.type === 'Crypto')) {
        failedCount++;
      }
    });

    await Promise.all(priceFetchPromises);

    let message = `Successfully updated ${updatedCount} investments.`;
    if (failedCount > 0) {
        message += ` Failed to fetch prices for ${failedCount} investments. Please check their tickers.`;
    }
    if(updatedCount === 0 && failedCount === 0) {
        message = 'All investment prices are already up-to-date.'
    }

    return { success: true, updatedInvestments, message };
  } catch (error) {
    console.error('Error refreshing investment prices:', error);
    return { success: false, updatedInvestments: currentInvestments, message: 'An unexpected error occurred while refreshing prices.' };
  }
}