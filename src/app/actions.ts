
'use server';

import type { Investment } from '@/lib/types';
import axios from 'axios';

interface UpdateResult {
  success: boolean;
  message: string;
  updatedInvestments: Investment[];
  failedInvestmentNames?: string[];
}

/* ---------------- Helpers ---------------- */

function compressNames(names: string[]): string {
  const counts = names.reduce<Record<string, number>>((m, n) => {
    m[n] = (m[n] ?? 0) + 1;
    return m;
  }, {});
  return Object.entries(counts)
    .map(([n, c]) => (c > 1 ? `${n} ×${c}` : n))
    .join(', ');
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const queue = [...items];
  const results: R[] = [];
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()!;
      results.push(await fn(item));
    }
  });
  await Promise.all(workers);
  return results;
}

/* ---------------- Stocks / ETFs (Yahoo) ---------------- */

async function getStockPrice(ticker: string): Promise<number | null> {
  if (!ticker) return null;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker
    )}?region=DE&lang=en-US&interval=1d&range=1d&includePrePost=true`;
    const { data } = await axios.get(url);
    const meta = data?.chart?.result?.[0]?.meta;
    const price =
      meta?.preMarketPrice ?? meta?.postMarketPrice ?? meta?.regularMarketPrice;
    if (price != null) return price;
    console.warn(`Price not found in Yahoo response for ${ticker}`, data);
    return null;
  } catch (error: any) {
    console.error(
      `Failed to fetch price for ${ticker}. Status: ${error.response?.status}. Data: ${JSON.stringify(
        error.response?.data
      )}`
    );
    return null;
  }
}

/* ---------------- Crypto (CoinGecko) ---------------- */

const COINGECKO_ID_ALIASES: Record<string, string> = {
  btc: 'bitcoin',
  xbt: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ether: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
  ada: 'cardano',
  bnb: 'binancecoin',
  xrp: 'ripple',
  doge: 'dogecoin',
  matic: 'matic-network',
  avax: 'avalanche-2',
  dot: 'polkadot',
};

async function resolveCryptoId(symOrId: string): Promise<string | null> {
  const key = symOrId?.trim().toLowerCase();
  if (!key) return null;
  if (COINGECKO_ID_ALIASES[key]) return COINGECKO_ID_ALIASES[key];

  try {
    const { data } = await axios.get(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(key)}`
    );
    const coins: any[] = data?.coins ?? [];
    const bySymbol = coins.find((c) => c?.symbol?.toLowerCase() === key);
    if (bySymbol?.id) return bySymbol.id;
    const byId = coins.find((c) => c?.id?.toLowerCase() === key);
    if (byId?.id) return byId.id;
    if (coins[0]?.id) return coins[0].id;
  } catch (err: any) {
    console.warn(
      `CoinGecko search failed for "${key}":`,
      err.response?.status,
      err.response?.data
    );
  }
  return null;
}

// Batched crypto fetch
async function fetchCryptoPrices(ids: string[]): Promise<Record<string, number>> {
  const unique = Array.from(new Set(ids.map((i) => i.toLowerCase()))).filter(Boolean);
  if (unique.length === 0) return {};
  // CoinGecko simple/price allows a lot of ids; chunk for safety
  const chunkSize = 150;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize));
  }

  const out: Record<string, number> = {};
  for (const group of chunks) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
        group.join(',')
      )}&vs_currencies=eur`;
      const { data } = await axios.get(url);
      for (const id of group) {
        const p = data?.[id]?.eur;
        if (p != null) out[id] = p;
      }
    } catch (error: any) {
      console.error(
        `CoinGecko batch failed (ids=${group.join(',')}). Status: ${error.response?.status}. Data: ${JSON.stringify(
          error.response?.data
        )}`
      );
    }
  }
  return out;
}

/* ---------------- Refresh pipeline ---------------- */

export async function refreshInvestmentPrices(
  currentInvestments: Investment[]
): Promise<UpdateResult> {
  try {
    const updates: Investment[] = [];
    const failed: string[] = [];

    // 1) Prepare crypto ids
    const cryptoItems = currentInvestments.filter(
      (inv) => inv.status !== 'Sold' && inv.type === 'Crypto' && !!inv.ticker
    );

    const idByInvestmentId = new Map<string, string>();
    await Promise.all(
      cryptoItems.map(async (inv) => {
        const id = await resolveCryptoId(inv.ticker!);
        if (id) idByInvestmentId.set(inv.id, id);
        else failed.push(inv.name);
      })
    );

    // 2) Fetch crypto prices in one (batched) call
    const cryptoIds = Array.from(new Set(Array.from(idByInvestmentId.values())));
    const cryptoPrices = await fetchCryptoPrices(cryptoIds);

    // 3) Apply crypto updates
    for (const inv of cryptoItems) {
      const id = idByInvestmentId.get(inv.id);
      const price =
        id ? cryptoPrices[id.toLowerCase()] : undefined;
      if (price == null) {
        failed.push(inv.name);
        continue;
      }
      if (price !== inv.currentValue) {
        updates.push({ ...inv, currentValue: price });
      }
    }

    // 4) Stocks/ETFs with limited concurrency (avoid throttling)
    const stockEtfItems = currentInvestments.filter(
      (inv) =>
        inv.status !== 'Sold' &&
        (inv.type === 'Stock' || inv.type === 'ETF') &&
        !!inv.ticker
    );

    await mapWithConcurrency(stockEtfItems, 5, async (inv) => {
      const price = await getStockPrice(inv.ticker!);
      if (price == null) {
        failed.push(inv.name);
        return;
      }
      if (price !== inv.currentValue) {
        updates.push({ ...inv, currentValue: price });
      }
    });

    // 5) Message
    const updatedCount = updates.length;
    const failedCount = failed.length;

    let message = `Successfully updated ${updatedCount} investments.`;
    if (failedCount > 0) {
      message += ` Failed to update: ${compressNames(failed)}.`;
    } else if (updatedCount === 0) {
      message = 'All investment prices are already up-to-date.';
    }

    return {
      success: true,
      updatedInvestments: updates,
      message,
      failedInvestmentNames: failed,
    };
  } catch (err) {
    console.error('Error refreshing investment prices:', err);
    return {
      success: false,
      updatedInvestments: [],
      message: 'An unexpected error occurred while refreshing prices.',
    };
  }
}
