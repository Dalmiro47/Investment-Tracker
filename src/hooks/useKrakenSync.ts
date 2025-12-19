import { useState } from 'react';
import { auth } from '@/lib/firebase';
import { doc, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getDailyEurRate } from '@/lib/providers/frankfurter';

// --- TypeScript Interface ---
export interface KrakenAccountLog {
  booking_uid: string;
  date: string;
  asset: string;
  info: string;
  realized_funding: number | null;
  realized_pnl: number | null;
  fee: number | null;
  margin_account: string;
}

type KrakenAccountLogResponse = {
  result?: 'success' | 'error';
  logs?: KrakenAccountLog[];
  error?: string;
  reason?: string;
};

// --- Sync Logic ---
export async function syncKrakenAccountLogs(payload: any, userId: string) {
  // Strict userId validation
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('Invalid userId provided to syncKrakenAccountLogs');
  }

  const logs = Array.isArray(payload?.logs) ? payload.logs : [];
  
  if (!logs.length) {
    console.warn('⚠️ API returned success but logs array is empty');
    return 0;
  }

  const batch = writeBatch(db);
  console.log(`🏗️ Preparing batch for ${logs.length} logs for user: ${userId}`);

  // Process logs sequentially to fetch exchange rates
  for (let index = 0; index < logs.length; index++) {
    const log = logs[index];
    
    if (!log.booking_uid) {
      console.warn(`⚠️ Skipping log at index ${index}: missing booking_uid`);
      continue;
    }

    // Strict Pathing: Explicitly ensure the path is correct
    const firestorePath = `users/${userId}/kraken_logs/${log.booking_uid}`;
    const logRef = doc(db, 'users', userId, 'kraken_logs', log.booking_uid);
    console.log(`📝 Adding to batch: ${firestorePath}`);

    // HEAVY LIFTING: Currency Conversion Logic
    const logDate = new Date(log.date);
    let exchangeRate = 0.85; // Default fallback
    
    try {
      exchangeRate = await getDailyEurRate(logDate, 'USD');
    } catch (e) {
      console.warn(`⚠️ Failed to fetch exchange rate for ${log.date}, using fallback: ${exchangeRate}`);
    }

    // Parse numeric values from log
    const realizedFunding = parseFloat(log.realized_funding) || 0;
    const realizedPnl = parseFloat(log.realized_pnl) || 0;
    const fee = parseFloat(log.fee) || 0;
    const rawPrice = parseFloat(log.trade_price || log.entryPrice || log.price || 0);
    const quantity = parseFloat(log.quantity || log.size || 0);

    // Calculate EUR equivalents for German Tax compliance
    const entryPriceEur = rawPrice * exchangeRate;
    const realizedFundingEur = realizedFunding * exchangeRate;
    const realizedPnlEur = realizedPnl * exchangeRate;
    const feeEur = fee * exchangeRate;
    const totalAmountEur = quantity * entryPriceEur;

    // Type Safety: Store both USD and EUR values
    const docData = {
      ...log,
      // Raw USD values
      realized_funding: realizedFunding,
      realized_pnl: realizedPnl,
      fee: fee,
      entryPriceUsd: rawPrice,
      
      // EUR converted values for German tax
      entryPriceEur: entryPriceEur,
      realizedFundingEur: realizedFundingEur,
      realizedPnlEur: realizedPnlEur,
      feeEur: feeEur,
      totalAmountEur: totalAmountEur,
      
      // This is what UI should display
      displayPrice: entryPriceEur,
      valueInEur: totalAmountEur,
      
      // Currency metadata
      currency: 'USD',
      baseCurrency: 'EUR',
      exchangeRate: exchangeRate,
      
      // Timestamps
      timestamp: Timestamp.fromDate(logDate),
      syncedAt: Timestamp.now(),
    };

    batch.set(logRef, docData, { merge: true });
  }

  try {
    await batch.commit();
    console.log("✅ Firestore Batch Committed successfully!");
    return logs.length;
  } catch (err: any) {
    console.error("❌ Firestore Batch Failed:", err);
    
    // Specific handling for permission errors
    if (err?.code === 'permission-denied' || err?.message?.includes('permission')) {
      const errorMsg = 'Firestore permission denied. Check your security rules for kraken_logs collection.';
      console.error('🔒', errorMsg);
      if (typeof window !== 'undefined') {
        window.alert(errorMsg);
      }
    }
    
    throw err;
  }
}

// --- React Hook ---
export function useKrakenSync() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState<number | null>(null);

  const syncLogs = async () => {
    setLoading(true);
    setError(null);
    setSyncedCount(null);

    try {
      // Auth State Resilience: Wait for auth to be ready
      let user = auth.currentUser;
      
      if (!user) {
        console.log('⏳ Waiting for auth state...');
        // Give auth a moment to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
        user = auth.currentUser;
      }

      if (!user || !user.uid) {
        const errorMsg = 'No authenticated user found. Please log in and try again.';
        setError(errorMsg);
        console.error('🚫', errorMsg);
        return;
      }

      console.log('✅ Authenticated as:', user.uid);
      console.log('📡 Fetching logs from API...');
      
      const response = await fetch('/api/kraken/account-log');
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('📦 API Response received:', data);

      // Validate response structure
      if (data.error || data.reason) {
        throw new Error(data.error || data.reason);
      }

      if (!data.logs || !Array.isArray(data.logs)) {
        console.warn('⚠️ API returned success but logs array is missing or invalid');
        setSyncedCount(0);
        return;
      }

      // Execute sync with validated userId
      const count = await syncKrakenAccountLogs(data, user.uid);
      setSyncedCount(count);
      console.log(`✅ Successfully synced ${count} log entries`);
      
    } catch (err: any) {
      console.error('❌ Sync failed:', err);
      setError(err.message || 'Unknown error during sync');
      
      // Show alert for critical errors
      if (err?.message?.includes('permission') && typeof window !== 'undefined') {
        window.alert(`Sync failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return { syncLogs, loading, error, syncedCount };
}