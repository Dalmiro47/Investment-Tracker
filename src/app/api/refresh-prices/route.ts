import { NextResponse } from 'next/server';
import { refreshEtfPlanPrices } from '@/app/actions/prices';
import { format, parseISO, startOfMonth } from 'date-fns';

export const runtime = 'nodejs';

export async function POST(req: Request) {
    try {
        const { uid, planId, components, startDate } = await req.json();
        if (!uid || !planId || !components || !startDate) {
            return NextResponse.json({ ok: false, error: 'Missing required parameters.' }, { status: 400 });
        }
        
        const since = format(startOfMonth(parseISO(startDate)), 'yyyy-MM-dd');
        const result = await refreshEtfPlanPrices(uid, planId, components, since);

        if (result.ok) {
            return NextResponse.json({ ok: true, message: result.message });
        } else {
            return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
        }
    } catch (e: any) {
        console.error('refresh-prices API error:', e);
        return NextResponse.json({ ok: false, error: String(e?.message ?? 'An unknown error occurred during price refresh.') }, { status: 500 });
    }
}
