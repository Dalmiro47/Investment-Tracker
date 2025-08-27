
'use server';

import type { Investment } from '@/lib/types';
import axios from 'axios';

interface UpdateResult {
  success: boolean;
  message: string;
  updatedInvestments: Investment[];
  failedInvestmentNames?: string[];
}

// Fetches price from Yahoo Finance for Stocks/ETFs
async function getStockPrice(ticker: string): Promise<number | null> {
  if (!ticker) return null;
  try {
    // Using the v8 chart endpoint can be more reliable
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?region=DE&lang=en-US&interval=1d&range=1d`);
    const result = response.data?.chart?.result?.[0];
    const meta = result?.meta;
    
    // Prioritize the most "live" price available
    const price = meta?.preMarketPrice || meta?.postMarketPrice || meta?.regularMarketPrice;
    
    if (price) {
      return price;
    }
    console.warn(`Price not found in response for stock/ETF ticker: ${ticker}`, JSON.stringify(response.data, null, 2));
    return null;
  } catch (error: any) {
    // Log more detailed error information
    console.error(`Failed to fetch price for stock/ETF ticker: ${ticker}. Status: ${error.response?.status}. Data: ${JSON.stringify(error.response?.data)}`);
    return null;
  }
}

// Fetches price from CoinGecko for Crypto
async function getCryptoPrice(id: string): Promise<number | null> {
  if (!id) return null;
  try {
    const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${id.toLowerCase()}&vs_currencies=eur`);
    const price = response.data[id.toLowerCase()]?.eur;
    
    if (price) {
        return price;
    }
    console.warn(`Price not found in response for crypto ID: ${id}. Full response:`, JSON.stringify(response.data, null, 2));
    return null;
  } catch (error: any) {
    console.error(`Failed to fetch price for crypto ID: ${id}. Status: ${error.response?.status}. Data: ${JSON.stringify(error.response?.data)}`);
    return null;
  }
}

export async function refreshInvestmentPrices(currentInvestments: Investment[]): Promise<UpdateResult> {
  try {
    const investmentsToUpdate: Investment[] = [];
    const failedInvestments: string[] = [];

    const priceFetchPromises = currentInvestments.map(async (inv) => {
      // Do not refresh prices for sold investments
      if (inv.status === 'Sold') {
        return;
      }
      
      let newPrice: number | null = null;
      if ((inv.type === 'Stock' || inv.type === 'ETF') && inv.ticker) {
        newPrice = await getStockPrice(inv.ticker);
      } else if (inv.type === 'Crypto' && inv.ticker) {
        newPrice = await getCryptoPrice(inv.ticker);
      }

      if (newPrice === null) {
        // Only mark as failed if the type is one that should have a price
        if (['Stock', 'ETF', 'Crypto'].includes(inv.type)) {
            failedInvestments.push(inv.name);
        }
        return; // Skip to next investment
      }

      // Only add to update list if the new price is actually different
      if (newPrice !== inv.currentValue) {
        investmentsToUpdate.push({ ...inv, currentValue: newPrice });
      }
    });

    await Promise.all(priceFetchPromises);
    
    const updatedCount = investmentsToUpdate.length;
    const failedCount = failedInvestments.length;

    let message = `Successfully updated ${updatedCount} investments.`;
    if (failedCount > 0) {
        message += ` Failed to fetch prices for ${failedCount} investments: ${failedInvestments.join(', ')}.`;
    } else if (updatedCount === 0 && failedCount === 0) {
        message = 'All investment prices are already up-to-date.'
    }

    return { 
        success: true, 
        updatedInvestments: investmentsToUpdate, 
        message, 
        failedInvestmentNames: failedInvestments 
    };
  } catch (error) {
    console.error('Error refreshing investment prices:', error);
    return { success: false, updatedInvestments: [], message: 'An unexpected error occurred while refreshing prices.' };
  }
}
