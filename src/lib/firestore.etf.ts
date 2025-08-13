
import { db } from './firebase';
import { collection, doc, writeBatch, getDocs, query, where, Timestamp } from 'firebase/firestore';
import type { ETFPricePoint, FXRatePoint } from './types.etf';

const fxCol = () => collection(db, 'fx', 'eur_monthly', 'points');
const pricesCol = (planId: string, symbol: string) => collection(db, 'etfPlans', planId, 'prices', symbol, 'points');

export async function cachePrices(uid: string, planId: string, monthlyBySymbol: Record<string, ETFPricePoint[]>) {
    const batch = writeBatch(db);

    for (const symbol in monthlyBySymbol) {
        const points = monthlyBySymbol[symbol];
        points.forEach(point => {
            const dateId = point.date; // YYYY-MM-DD
            const pointRef = doc(db, 'users', uid, 'etfPlans', planId, 'prices', symbol, 'points', dateId);
            batch.set(pointRef, {
                ...point,
                date: Timestamp.fromDate(new Date(point.date))
            });
        });
    }

    await batch.commit();
}

export async function cacheFX(uid: string, points: FXRatePoint[]) {
    const batch = writeBatch(db);
    points.forEach(point => {
        const dateId = point.date; // YYYY-MM-28 (or other day)
        const pointRef = doc(db, 'users', uid, 'fx', 'monthly', dateId);
        batch.set(pointRef, {
            ...point,
            date: Timestamp.fromDate(new Date(point.date))
        });
    });
    await batch.commit();
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
