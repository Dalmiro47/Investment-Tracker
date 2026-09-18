import { NextResponse } from 'next/server';
import { krakenPerpSymbol } from '@/lib/futures-pnl';

type KrakenTicker = { symbol?: string; markPrice?: number | string };

// A missing price is reported as `price: null` (HTTP 200 so the UI does not crash).
// It must never be reported as 0: callers would compute a -100% unrealized loss.
const unavailable = (error: string) =>
  NextResponse.json({ price: null, error }, { status: 200 });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Accepts app labels such as "XBT", "BTC", "ETH", "ADA" and maps them to PF_<ASSET>USD.
  const symbol = krakenPerpSymbol(searchParams.get('asset'));

  if (!symbol) {
    return unavailable('Unsupported asset');
  }

  try {
    const response = await fetch(`https://futures.kraken.com/derivatives/api/v3/tickers`, {
      next: { revalidate: 30 } // Cache for 30 seconds
    });

    if (!response.ok) {
      console.error('❌ Kraken API returned non-OK status:', response.status);
      return unavailable('Kraken tickers request failed');
    }

    const data: { tickers?: KrakenTicker[] } = await response.json();
    const ticker = (data.tickers ?? []).find((t) => t.symbol?.toUpperCase() === symbol);

    if (!ticker) {
      console.warn(`⚠️ Ticker not found for ${symbol}`);
      return unavailable(`Ticker not found for ${symbol}`);
    }

    // Unrealized PnL on Kraken is computed against the MARK price (not index / last).
    const markPrice = Number(ticker.markPrice);
    if (!Number.isFinite(markPrice) || markPrice <= 0) {
      return unavailable(`Invalid mark price for ${symbol}`);
    }

    return NextResponse.json({ price: markPrice, symbol });
  } catch (error) {
    console.error('❌ Kraken API Error:', error);
    return unavailable('Kraken tickers request threw');
  }
}
