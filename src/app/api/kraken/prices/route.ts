import { NextResponse } from 'next/server';

const krakenSymbolMap: Record<string, string> = {
  ETH: 'PF_ETHUSD',  // Perpetual Futures contract for exact mark price
  BTC: 'PF_XBTUSD',  // Perpetual Futures contract for exact mark price
  ADA: 'PF_ADAUSD', // Added ADA support
  SOL: 'PF_SOLUSD', // Added SOL for your future trades
  DOT: 'PF_DOTUSD', // Added DOT for your future trades
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const asset = searchParams.get('asset')?.toUpperCase(); // Ensure uppercase

  if (!asset || !krakenSymbolMap[asset]) {
    return NextResponse.json({ price: 0, error: 'Unsupported asset' }, { status: 200 }); // Return 0 instead of 400 to prevent front-end crashes
  }

  try {
    const response = await fetch(`https://futures.kraken.com/derivatives/api/v3/tickers`, {
      next: { revalidate: 30 } // Cache for 30 seconds
    });
    
    if (!response.ok) {
      console.error('❌ Kraken API returned non-OK status:', response.status);
      return NextResponse.json({ price: 0 }, { status: 200 });
    }

    const data = await response.json();
    const ticker = data.tickers.find((t: any) => t.symbol === krakenSymbolMap[asset]);

    if (!ticker) {
      console.warn(`⚠️ Ticker not found for ${asset}`);
      return NextResponse.json({ price: 0 }, { status: 200 });
    }

    return NextResponse.json({ price: parseFloat(ticker.markPrice) });
  } catch (error) {
    console.error('❌ Kraken API Error:', error);
    return NextResponse.json({ price: 0 }, { status: 200 });
  }
}