import { NextResponse } from 'next/server';

const krakenSymbolMap: Record<string, string> = {
  ETH: 'PI_ETHUSD',
  BTC: 'PI_XBTUSD',
  // Agregar más mapeos según sea necesario
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const asset = searchParams.get('asset');

  if (!asset) {
    return NextResponse.json({ error: 'Asset parameter is required' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://futures.kraken.com/derivatives/api/v3/tickers`);

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch data from Kraken API' }, { status: 500 });
    }

    const data = await response.json();
    const krakenSymbol = krakenSymbolMap[asset];

    if (!krakenSymbol) {
      return NextResponse.json({ error: 'Unsupported asset' }, { status: 400 });
    }

    const ticker = data.tickers.find((t: any) => t.symbol === krakenSymbol);

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker not found' }, { status: 404 });
    }

    return NextResponse.json({ price: ticker.markPrice });
  } catch (error) {
    console.error('Error fetching Kraken prices:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}