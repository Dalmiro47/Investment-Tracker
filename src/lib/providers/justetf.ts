
import { endOfMonth, parseISO } from 'date-fns';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

export async function upsertCurrentMonthFromJustETF(
  uid: string,
  planId: string,
  symbol: string,
  isin: string,
) {
  // Use NEXT_PUBLIC_BASE_URL to construct absolute URL for server-side fetch
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const proxyUrl = `${baseUrl}/api/justetf/quote?isin=${encodeURIComponent(isin)}`;

  const res = await fetch(proxyUrl, { cache: 'no-store' });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to parse error response' }));
    throw new Error(errorData?.error || `JustETF proxy fetch failed with status ${res.status}`);
  }
  
  const data = await res.json();
  if (!data?.ok) throw new Error(data?.error || 'JustETF quote failed');

  const { price, currency, month } = data;
  const monthEnd = endOfMonth(parseISO(data.asOf));

  const ref = adminDb.doc(`users/${uid}/etfPlans/${planId}/prices/${symbol}/points/${month}`);
  
  await ref.set({
    symbol,
    close: Number(price),
    currency: currency || 'EUR',
    date: Timestamp.fromDate(monthEnd),
  }, { merge: true });

  console.log(`[JustETF] Upserted price for ${symbol} for month ${month}: ${price} ${currency}`);
  return month;
}
