
import { db } from './firebase';
import { collection, doc, writeBatch, getDocs, query, where, Timestamp, WriteBatch } from 'firebase/firestore';
import type { ETFPricePoint, FXRatePoint } from './types.etf';

// Helper to commit writes in chunks to avoid 500-document limit
async function commitInChunks<T>(
    items: T[], 
    writeFn: (batch: WriteBatch, item: T) => void
) {
    let batch = writeBatch(db);
    let count = 0;
    for (const item of items) {
        writeFn(batch, item);
        count++;
        // 499 is a safe buffer below the 500 limit
        if (count === 499) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
        }
    }
    if (count > 0) {
        await batch.commit();
    }
}

export async function cachePrices(uid: string, planId: string, monthlyBySymbol: Record<string, ETFPricePoint[]>) {
    const allPoints = Object.entries(monthlyBySymbol).flatMap(([symbol, points]) => 
        points.map(point => ({ symbol, point }))
    );

    await commitInChunks(allPoints, (batch, { symbol, point }) => {
        const dateId = point.date; // YYYY-MM-DD
        const pointRef = doc(db, 'users', uid, 'etfPlans', planId, 'prices', symbol, 'points', dateId);
        batch.set(pointRef, {
            ...point,
            date: Timestamp.fromDate(new Date(point.date))
        });
    });
}


export async function cacheFX(uid: string, points: FXRatePoint[]) {
    await commitInChunks(points, (batch, point) => {
        const dateId = point.date; // YYYY-MM-DD
        const pointRef = doc(db, 'users', uid, 'fx', 'monthly', dateId);
        batch.set(pointRef, {
            ...point,
            date: Timestamp.fromDate(new Date(point.date))
        });
    });
}

export async function getFXRates(uid: string, startDate: string, endDate: string): Promise<Record<string, FXRatePoint>> {
    const q = query(
        collection(db, 'users', uid, 'fx', 'monthly'),
        where('date', '>=', Timestamp.fromDate(new Date(startDate))),
        where('date', '<=', Timestamp.fromDate(new Date(endDate)))
    );

    const snapshot = await getDocs(q);
    const rates: Record<string, FXRatePoint> = {};
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        rates[docSnap.id] = {
            date: (data.date as Timestamp).toDate().toISOString().split('T')[0],
            base: 'EUR',
            rates: data.rates,
        };
    });
    return rates;
}

export async function getPricePoints(uid: string, planId: string, symbol: string, startDate: string, endDate: string): Promise<Record<string, ETFPricePoint>> {
    const q = query(
        collection(db, 'users', uid, 'etfPlans', planId, 'prices', symbol, 'points'),
        where('date', '>=', Timestamp.fromDate(new Date(startDate))),
        where('date', '<=', Timestamp.fromDate(new Date(endDate)))
    );

    const snapshot = await getDocs(q);
    const prices: Record<string, ETFPricePoint> = {};
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        prices[docSnap.id] = {
            symbol: data.symbol,
            date: (data.date as Timestamp).toDate().toISOString().split('T')[0],
            close: data.close,
            currency: data.currency,
        };
    });
    return prices;
}
