import { NextResponse } from 'next/server';
import { fetchKrakenFills } from '@/lib/kraken-api';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lastFillTime = searchParams.get('lastFillTime');
    const count = searchParams.get('count');
    
    const params: Record<string, string | number> = {};
    if (lastFillTime) params.lastFillTime = lastFillTime;
    if (count) params.count = count;

    const data = await fetchKrakenFills(params as any);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Kraken fills API error:', error);
    return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 });
  }
}
