// Shared client-side fetcher for /api/kraken/prices.
// Several pollers (portfolio summary, futures table rows, dashboard) want the same mark
// price at the same time. They all go through here so concurrent callers share one
// request and a fresh result is reused instead of hitting the route again.

// Just under the 10s poll interval, so each poll cycle costs one request per asset.
const FRESH_MS = 9_000;
const TIMEOUT_MS = 5_000;

const cache = new Map<string, { price: number; at: number }>();
const inflight = new Map<string, Promise<number | null>>();

/** "XBT/USD", "ETH-PERP", "ada" -> "XBT", "ETH", "ADA" */
export function cleanFuturesAsset(asset: string): string {
  return asset.split('/')[0].split(' ')[0].split('-')[0].toUpperCase();
}

/**
 * Current Kraken mark price in USD, or null when unavailable.
 * Never returns 0/NaN: a 0 mark price would render a position as a -100% loss.
 * Failures are not cached, so the next poll retries.
 */
export function fetchKrakenMarkPrice(asset: string | null | undefined): Promise<number | null> {
  if (!asset) return Promise.resolve(null);
  const key = cleanFuturesAsset(asset);
  if (!key) return Promise.resolve(null);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return Promise.resolve(hit.price);

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async (): Promise<number | null> => {
    try {
      const res = await fetch(`/api/kraken/prices?asset=${encodeURIComponent(key)}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;

      const data: { price?: unknown } = await res.json();
      const price = Number(data.price);
      if (!Number.isFinite(price) || price <= 0) return null;

      cache.set(key, { price, at: Date.now() });
      return price;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, request);
  return request;
}
