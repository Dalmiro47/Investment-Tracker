
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isin = searchParams.get('isin');
  if (!isin) return NextResponse.json({ ok:false, error:'isin required' }, { status: 400 });

  const url = `https://www.justetf.com/api/etfs/${encodeURIComponent(isin)}/quote?locale=en&currency=EUR`;

  try {
    const res = await fetch(url, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'referer': 'https://www.justetf.com/',
        'accept-language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`JustETF request failed with status ${res.status}:`, errorBody);
      return NextResponse.json({ ok:false, error:`JustETF API error: ${res.status}` }, { status: 502 });
    }

    const j = await res.json();
    const price = j?.price ?? j?.last ?? j?.close ?? j?.quote;
    const ts = j?.date ?? j?.asOf ?? j?.time ?? j?.timestamp;

    if (price == null || ts == null) {
      console.error('Unexpected JustETF payload:', j);
      return NextResponse.json({ ok:false, error:'Unexpected JustETF API payload' }, { status: 500 });
    }

    const asOfISO = new Date(ts).toISOString();

    return NextResponse.json({
      ok: true,
      isin,
      currency: 'EUR',
      price: Number(price),
      asOf: asOfISO,
      month: asOfISO.slice(0,7),
    });

  } catch (error: any) {
    console.error('Error fetching from JustETF proxy:', error);
    return NextResponse.json({ ok: false, error: 'Proxy request to JustETF failed.' }, { status: 500 });
  }
}
