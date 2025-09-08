
'use server';

import type { Investment } from '@/lib/types';
import axios from 'axios';
import { dec, sub, EPS } from '@/lib/money';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';


interface UpdateResult {
  success: boolean;
  message: string;
  updatedCount: number;
  failedInvestmentNames?: string[];
  skippedReason?: 'rate_limited';
  nextAllowedAt?: string;
}

type RefreshInternalResult = {
  updatedInvestments: Pick<Investment, 'id' | 'name' | 'type' | 'currentValue'>[];
  failedInvestmentNames?: string[];
};


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
async function doPriceRefresh(currentInvestments: Investment[]): Promise<RefreshInternalResult> {
    const updates: RefreshInternalResult['updatedInvestments'] = [];
    const failed: string[] = [];

    const cryptoItems = currentInvestments.filter(
      (inv) => inv.status !== 'Sold' && inv.type === 'Crypto' && !!inv.ticker
    );
    const idByInvestmentId = new Map<string, string>();
    const unresolvedCrypto = new Set<string>();
    await Promise.all(
      cryptoItems.map(async (inv) => {
        const id = await resolveCryptoId(inv.ticker!);
        if (id) idByInvestmentId.set(inv.id, id);
        else unresolvedCrypto.add(inv.id);
      })
    );

    const cryptoIds = Array.from(new Set(Array.from(idByInvestmentId.values())));
    const cryptoPrices = await fetchCryptoPrices(cryptoIds);

    for (const inv of cryptoItems) {
      if (unresolvedCrypto.has(inv.id)) {
        failed.push(inv.name);
        continue;
      }
      const id = idByInvestmentId.get(inv.id)!;
      const price = cryptoPrices[id.toLowerCase()];
      if (price == null) {
        failed.push(inv.name);
        continue;
      }
      const curr = inv.currentValue ?? null;
      if (curr === null || sub(dec(price), dec(curr)).abs().gt(EPS)) {
        updates.push({ id: inv.id, name: inv.name, type: inv.type, currentValue: price });
      }
    }

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
      const curr = inv.currentValue ?? null;
      if (curr === null || sub(dec(price), dec(curr)).abs().gt(EPS)) {
        updates.push({ id: inv.id, name: inv.name, type: inv.type, currentValue: price });
      }
    });

    return { updatedInvestments: updates, failedInvestmentNames: failed };
}


export async function refreshInvestmentPrices(
  options?: { forced?: boolean; userId?: string }
): Promise<UpdateResult> {
  const { forced = false, userId } = options ?? {};
  if (!userId) {
    return { success: false, message: 'User not found.', updatedCount: 0 };
  }

  const metaRef = adminDb.doc(`users/${userId}/meta/pricing`);

  if (!forced) {
    const snap = await metaRef.get();
    if (snap.exists) {
      const lastRefreshAt = (snap.get('lastRefreshAt') as Timestamp)?.toMillis() ?? 0;
      const now = Date.now();
      if (now - lastRefreshAt < SERVER_DEBOUNCE_MS) {
        return {
          success: false,
          message: 'rate_limited',
          skippedReason: 'rate_limited',
          nextAllowedAt: new Date(lastRefreshAt + SERVER_DEBOUNCE_MS).toISOString(),
          updatedCount: 0,
        };
      }
    }
  }

  try {
    await metaRef.set({ lastRefreshAt: FieldValue.serverTimestamp() }, { merge: true });

    const snap = await adminDb.collection(`users/${userId}/investments`).where('status', '==', 'Active').get();
    const currentInvestments = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Investment[];

    const { updatedInvestments, failedInvestmentNames } = await doPriceRefresh(currentInvestments);
    
    if (updatedInvestments.length > 0) {
      const batch = adminDb.batch();
      const now = FieldValue.serverTimestamp();

      updatedInvestments.forEach(inv => {
        const ref = adminDb.doc(`users/${userId}/investments/${inv.id}`);
        batch.update(ref, {
          currentValue: inv.currentValue,
          currentPrice: inv.currentValue,
          currentPriceEur: inv.currentValue,
          lastPriceAt: now,
          lastPriceSource: inv.type === 'Crypto' ? 'coingecko' : 'yahoo',
        });
      });

      await batch.commit();
    }

    const updatedCount = updatedInvestments.length;
    const failedCount = failedInvestmentNames?.length ?? 0;

    let message = `Successfully updated ${updatedCount} investments.`;
    if (failedCount > 0) {
      message += ` Failed to update: ${compressNames(failedInvestmentNames!)}.`;
    } else if (updatedCount === 0) {
      message = 'All investment prices are already up-to-date.';
    }

    await metaRef.set(
        { lastRefreshCompletedAt: FieldValue.serverTimestamp(), updatedCount, failedCount },
        { merge: true }
    );

    return {
      success: true,
      message,
      updatedCount,
      failedInvestmentNames: failedInvestmentNames,
    };
  } catch (err) {
    console.error('Error refreshing investment prices:', err);
    return {
      success: false,
      message: 'An unexpected error occurred while refreshing prices.',
      updatedCount: 0,
    };
  }
}
