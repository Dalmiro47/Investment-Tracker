import { NextResponse } from 'next/server';
import { fetchKrakenAccountLog } from '@/lib/kraken-api';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const count = searchParams.get('count');
    const continuationToken = searchParams.get('continuationToken');
    const info = searchParams.get('info');
    const from = searchParams.get('from');
    
    const params: Record<string, string | number> = {};
    if (count) params.count = count;
    if (continuationToken) params.continuationToken = continuationToken;
    if (info) params.info = info;
    if (from) params.from = parseInt(from, 10);

    const data = await fetchKrakenAccountLog(params as any);
    return NextResponse.json(data, { status: 200 });
  } catch (error: any) {
    console.error('Kraken account-log API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Unexpected error calling Kraken account-log' },
      { status: 500 }
    );
  }
}
