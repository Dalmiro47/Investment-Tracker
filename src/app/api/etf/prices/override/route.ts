
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export const runtime = 'nodejs';

export async function POST(req: Request) {
    try {
        const { uid, planId, symbol, month, close, currency, note } = await req.json();

        // --- Validation ---
        if (!uid || !planId || !symbol || !month || !close || !currency) {
            return NextResponse.json({ ok: false, error: 'Missing required parameters.' }, { status: 400 });
        }
        if (!/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ ok: false, error: 'Month must be in YYYY-MM format.' }, { status: 400 });
        }
        if (typeof close !== 'number' || close <= 0) {
            return NextResponse.json({ ok: false, error: 'Close price must be a positive number.' }, { status: 400 });
        }
        if (typeof currency !== 'string' || currency.length !== 3) {
            return NextResponse.json({ ok: false, error: 'Currency must be a 3-letter code.' }, { status: 400 });
        }

        const overrideRef = adminDb.doc(`users/${uid}/etfPlans/${planId}/prices/${symbol}/overrides/${month}`);

        await overrideRef.set({
            close,
            currency: currency.toUpperCase(),
            note: note || null,
            source: 'manual',
            createdAt: Timestamp.now(),
        }, { merge: true });

        return NextResponse.json({ ok: true });

    } catch (e: any) {
        console.error('override API error:', e);
        return NextResponse.json({ ok: false, error: String(e?.message ?? 'An unknown error occurred.') }, { status: 500 });
    }
}
