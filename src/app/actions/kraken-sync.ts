'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDailyEurRate } from '@/lib/providers/frankfurter';
import { fetchKrakenAccountLog, fetchKrakenFills } from '@/lib/kraken-api';

// --- TYPES ---
type KrakenLog = {
  id: number;
  booking_uid: string;
  date: string;
  asset: string;
  info: string;
  contract: string;
  realized_pnl: number;
  realized_funding?: number; // Added: The field you noticed
  fee: number;
  old_average_entry_price?: number;
  new_average_entry_price?: number; 
  execution: string; 
};

type KrakenFill = {
  fill_id: string;
  order_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  fillTime: string;
};

// --- HELPERS ---

// 1. Clean Ticker (PF_ADAUSD -> ADA)
function formatTicker(rawSymbol: string): string {
  // Remove prefixes like PF_, PI_, FI_ and suffix USD
  return rawSymbol.replace(/^(PF_|PI_|FI_)/, '').replace(/USD$/, '');
}

// 2. History Walker (Find Open Date)
function findOpenDateForClosure(allFills: KrakenFill[], currentFill: KrakenFill): Date {
  const history = allFills
    .filter(f => f.symbol === currentFill.symbol && new Date(f.fillTime) <= new Date(currentFill.fillTime))
    .sort((a, b) => new Date(b.fillTime).getTime() - new Date(a.fillTime).getTime());

  let netPosition = 0;
  for (const fill of history) {
    const size = Number(fill.size);
    if (fill.side === 'buy') netPosition += size; 
    else netPosition -= size;

    if (Math.abs(netPosition) < 0.0001) {
      return new Date(fill.fillTime);
    }
  }
  return history.length > 0 ? new Date(history[history.length - 1].fillTime) : new Date(currentFill.fillTime);
}

// 3. Back-calculate Entry Price if API misses it
function calculateFallbackEntry(
  exitPrice: number, 
  size: number, 
  pnl: number, 
  positionSide: 'LONG' | 'SHORT' // This is the POSITION side (not trade side)
): number {
  if (size === 0) return 0;
  
  // Formulas derived from: PnL = (Exit - Entry) * Size [Long]
  // Long: Entry = Exit - (PnL / Size)
  // Short: Entry = Exit + (PnL / Size)
  
  const priceDelta = pnl / size;
  return positionSide === 'LONG' 
    ? exitPrice - priceDelta 
    : exitPrice + priceDelta;
}

// 4. Sum Funding from Firestore
async function calculateFundingForPosition(
  userId: string, 
  contract: string, 
  start: Date, 
  end: Date
): Promise<number> {
  try {
    const db = adminDb;
    const logsRef = db.collection('users').doc(userId).collection('kraken_logs');
    const cleanContract = contract.toLowerCase();

    // TIME BUFFER: Expand window by 1 hour to catch funding that happened close to open/close
    const bufferedStart = new Date(start);
    bufferedStart.setHours(bufferedStart.getHours() - 1);
    
    const bufferedEnd = new Date(end);
    bufferedEnd.setHours(bufferedEnd.getHours() + 1);

    const snapshot = await logsRef
      .where('contract', '==', cleanContract) 
      .where('type', '==', 'funding rate change')
      .where('date', '>=', Timestamp.fromDate(bufferedStart))
      .where('date', '<=', Timestamp.fromDate(bufferedEnd))
      .get();

    if (snapshot.empty) return 0;

    let totalFundingEur = 0;
    snapshot.forEach(doc => {
      const data = doc.data();
      // Ensure we treat it as a number
      const val = Number(data.realizedFundingEur) || 0;
      totalFundingEur += val;
    });

    return totalFundingEur;
  } catch (err) {
    console.error('Error calculating funding:', err);
    return 0;
  }
}

// --- MAIN SYNC FUNCTION ---
export async function syncKrakenFutures(userId: string) {
  if (!userId) return { ok: false, message: 'No User ID' };

  try {
    const db = adminDb;
    const metaRef = db.doc(`users/${userId}/metadata/kraken_sync`);
    
    const metaSnap = await metaRef.get();
    let lastLogId = metaSnap.data()?.lastLogId || 0;
    
    console.log(`🔄 Syncing Kraken Futures starting from Log ID: ${lastLogId}...`);

    let hasMore = true;
    let totalProcessed = 0;
    let totalClosed = 0;
    const BATCH_SIZE = 500; 
    const rateCache = new Map<string, number>();

    while (hasMore) {
      const logResponse = await fetchKrakenAccountLog({
        from: lastLogId + 1,
        count: BATCH_SIZE,
        sort: 'asc' 
      });
      
      const logs: KrakenLog[] = logResponse.logs || logResponse.accountLog || [];

      if (logs.length === 0) {
        hasMore = false;
        break; 
      }

      console.log(`   Fetched batch of ${logs.length} logs (ID ${logs[0].id} to ${logs[logs.length-1].id})`);

      // 1. SAVE GRANULAR LOGS
      const logBatch = db.batch();
      let logBatchCount = 0;

      for (const log of logs) {
        if (['conversion', 'transfer', 'margin'].includes(log.info)) continue;

        const logDate = new Date(log.date);
        const dateKey = logDate.toISOString().split('T')[0];
        
        let eurRate = rateCache.get(dateKey);
        if (!eurRate) {
          eurRate = await getDailyEurRate(logDate, 'USD').catch(() => 0.85); 
          rateCache.set(dateKey, eurRate);
        }

        const realizedVal = Number(log.realized_pnl) || 0;
        const feeVal = Number(log.fee) || 0;
        const hasPnL = Math.abs(realizedVal) > 0.000001; 
        
        // FIX: Check BOTH fields for the funding value
        const realizedFunding = Number(log.realized_funding) || 0;
        
        // Robust Extraction: If it's a funding log, find the non-zero value
        let rawFundingAmount = 0;
        if (log.info === 'funding rate change') {
            if (Math.abs(realizedVal) > 0) rawFundingAmount = realizedVal;
            else if (Math.abs(realizedFunding) > 0) rawFundingAmount = realizedFunding;
        } else {
            // For trades, funding is strictly in the specialized field
            rawFundingAmount = realizedFunding;
        }

        const fundingEur = rawFundingAmount * eurRate;

        const logRef = db.collection('users').doc(userId).collection('kraken_logs').doc(log.booking_uid);
        const normalizedContract = log.contract ? log.contract.toLowerCase() : '';

        logBatch.set(logRef, {
            id: log.booking_uid,
            logId: log.id,
            date: Timestamp.fromDate(logDate),
            type: log.info, 
            asset: log.asset,
            contract: normalizedContract, // Saved as 'pf_ethusd' consistently
            amount: realizedVal, 
            fee: feeVal,
            amountEur: realizedVal * eurRate,
            feeEur: feeVal * eurRate,
            eurRate: eurRate,
            realizedFundingEur: fundingEur, // Store explicitly
            realizedPnlEur: hasPnL && log.info !== 'funding rate change' ? (realizedVal * eurRate) : 0,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        
        logBatchCount++;
      }

      if (logBatchCount > 0) {
        await logBatch.commit();
      }

      // 2. IDENTIFY CLOSURES
      const closureLogs = logs.filter((l: KrakenLog) => {
          const val = Number(l.realized_pnl) || 0;
          const isExplicit = l.info === 'realized_pnl' || l.info === 'liquidation';
          const isHiddenPnL = l.info === 'futures trade' && Math.abs(val) > 0.000001;
          return isExplicit || isHiddenPnL;
      });

      if (closureLogs.length > 0) {
        console.log(`   🎯 FOUND ${closureLogs.length} CLOSURE EVENTS! Processing...`);
        
        const allFillsMap = new Map<string, KrakenFill>();
        const sortedClosures = [...closureLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        for (const closure of sortedClosures) {
            if (allFillsMap.has(closure.execution)) continue;
            const targetTime = new Date(closure.date);
            targetTime.setSeconds(targetTime.getSeconds() + 1); 

            const fillRes = await fetchKrakenFills({
                lastFillTime: targetTime.toISOString(),
                count: 100 
            });

            const fills = fillRes.fills || [];
            fills.forEach((f: KrakenFill) => allFillsMap.set(f.fill_id, f));
        }

        const allFills = Array.from(allFillsMap.values());
        const posBatch = db.batch();
        let posBatchCount = 0;

        for (const log of closureLogs) {
          const matchingFill = allFillsMap.get(log.execution);
          if (!matchingFill) continue;

          const logDate = new Date(log.date);
          const dateKey = logDate.toISOString().split('T')[0];
          const eurRate = rateCache.get(dateKey) || 0.85;

          // Determine Side
          const positionSide = matchingFill.side === 'buy' ? 'SHORT' : 'LONG';
          const size = Number(matchingFill.size);
          const exitPrice = Number(matchingFill.price);
          const realizedPnl = Number(log.realized_pnl);

          // --- ENTRY PRICE LOGIC ---
          // 1. Try old_average (Best)
          // 2. Try new_average (Okay for partials, bad for full close as it might be 0)
          // 3. Fallback calculation (Mathematical certainty)
          let entryPrice = Number(log.old_average_entry_price || 0);
          if (entryPrice === 0) {
            const newEntry = Number(log.new_average_entry_price || 0);
            if (newEntry > 0) {
               entryPrice = newEntry;
            } else {
               entryPrice = calculateFallbackEntry(exitPrice, size, realizedPnl, positionSide as any);
            }
          }

          const openedAt = findOpenDateForClosure(allFills, matchingFill);
          
          // --- FUNDING AGGREGATION ---
          // FIX: Pass the contract (lowercase normalization happens inside the function)
          let totalFundingEur = await calculateFundingForPosition(userId, log.contract, openedAt, logDate);
          if (log.realized_funding) {
             totalFundingEur += (log.realized_funding * eurRate);
          }

          const realizedPnlEur = realizedPnl * eurRate;
          const feeEur = (log.fee || 0) * eurRate;
          const netRealizedPnlEur = realizedPnlEur - feeEur + totalFundingEur;

          const docRef = db.collection('users').doc(userId).collection('futures_positions').doc(`CLOSED-${log.booking_uid}`);
          
          posBatch.set(docRef, {
            id: `CLOSED-${log.booking_uid}`,
            status: 'CLOSED',
            asset: formatTicker(matchingFill.symbol), 
            ticker: formatTicker(matchingFill.symbol) + '-PERP',
            side: positionSide,
            size: size,
            exitPrice: exitPrice,
            entryPrice: entryPrice,
            realizedPnL: realizedPnl,
            realizedPnlEur,
            feeEur,
            fundingEur: totalFundingEur, // Stored directly in the position!
            netRealizedPnlEur,
            closingOrderId: matchingFill.order_id,
            closingTradeId: matchingFill.fill_id,
            openedAt: Timestamp.fromDate(openedAt),
            closedAt: Timestamp.fromDate(logDate),
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });

          posBatchCount++;
          totalClosed++;
        }

        if (posBatchCount > 0) {
          await posBatch.commit();
          console.log(`      ✅ Saved ${posBatchCount} closed positions.`);
        }
      }

      const maxIdInBatch = logs.reduce((max: number, l: KrakenLog) => l.id > max ? l.id : max, lastLogId);
      lastLogId = maxIdInBatch;
      
      await metaRef.set({ lastLogId: maxIdInBatch }, { merge: true });
      totalProcessed += logs.length;
      
      if (totalProcessed > 5000) break;
    }

    return { ok: true, message: `Synced. Processed ${totalProcessed} logs, found ${totalClosed} closures.` };

  } catch (error: any) {
    console.error('Sync Error:', error);
    return { ok: false, message: error.message };
  }
}