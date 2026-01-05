'use server';

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDailyEurRate } from '@/lib/providers/frankfurter';
import { fetchKrakenAccountLog, fetchKrakenFills, fetchKrakenOpenPositions } from '@/lib/kraken-api';

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
// NEW: History Walker for OPEN positions (Finds start of current active position)
function findOpenDateForActivePosition(
  allFills: KrakenFill[], 
  symbol: string, 
  currentSize: number, 
  side: 'LONG' | 'SHORT'
): Date {
  // Sort descending: Newest fill first
  const history = allFills
    .filter(f => formatTicker(f.symbol) === formatTicker(symbol)) // Normalize ticker matching
    .sort((a, b) => new Date(b.fillTime).getTime() - new Date(a.fillTime).getTime());

  if (history.length === 0) return new Date(); // Fallback to now

  // We start with the CURRENT size (e.g. +2.1 ETH)
  // We walk backwards, reversing each trade.
  // If we have +2.1, and the last trade was BUY 0.1, previous state was +2.0.
  // We stop when we hit 0 (or cross it, meaning the position flipped).
  
  let netPosition = side === 'LONG' ? currentSize : -currentSize;

  for (const fill of history) {
    const fillSize = Number(fill.size);
    
    // Reverse the fill effect
    if (fill.side === 'buy') {
        netPosition -= fillSize; // A buy added to position, so remove it
    } else {
        netPosition += fillSize; // A sell reduced position, so add it back
    }

    // Check if we hit zero (floating point safe check)
    if (Math.abs(netPosition) < 0.0001) {
      return new Date(fill.fillTime);
    }
    
    // If we crossed zero (e.g. went from +0.5 to -0.5), this fill flipped the position.
    // This fill IS the start of the current trend.
    const isLong = side === 'LONG';
    if ((isLong && netPosition < 0) || (!isLong && netPosition > 0)) {
       return new Date(fill.fillTime);
    }
  }
  
  // If we run out of history, return the oldest fill we found
  return new Date(history[history.length - 1].fillTime);
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

// NEW: Create Investment wrapper with ALL fills/trades for complete tax audit
async function createInvestmentWrapperForClosedPosition(
  userId: string,
  closedPosition: {
    id: string;
    asset: string;
    ticker: string;
    side: string;
    size: number;
    entryPrice: number;
    exitPrice: number;
    realizedPnL: number;
    realizedPnlEur: number;
    feeEur: number;
    fundingEur: number;
    netRealizedPnlEur: number;
    closingOrderId: string;
    closingTradeId: string;
    openedAt: Date;
    closedAt: Date;
    exchangeRate: number;
  },
  allFills: KrakenFill[]
) {
  try {
    const db = adminDb;
    const invRef = db.collection('users').doc(userId).collection('investments').doc(closedPosition.id);
    
    // Create Investment wrapper
    await invRef.set({
      id: closedPosition.id,
      name: `${closedPosition.asset} Futures`,
      type: 'Future',
      ticker: closedPosition.ticker,
      purchaseDate: closedPosition.openedAt.toISOString(),
      purchaseQuantity: closedPosition.size,
      purchasePricePerUnit: closedPosition.entryPrice,
      currentValue: closedPosition.exitPrice,
      status: 'Sold',
      totalSoldQty: closedPosition.size,
      realizedProceeds: closedPosition.size * closedPosition.exitPrice * closedPosition.exchangeRate,
      realizedPnL: closedPosition.netRealizedPnlEur,
      dividends: 0,
      interest: 0,
      createdAt: closedPosition.openedAt.toISOString(),
      updatedAt: closedPosition.closedAt.toISOString(),
      // Link to real futures_positions data
      _futuresPositionRef: `futures_positions/${closedPosition.id}`,
    }, { merge: true });

    // Get all fills for this position
    const relevantFills = allFills
      .filter(f => formatTicker(f.symbol) === closedPosition.asset)
      .filter(f => {
        const fillTime = new Date(f.fillTime);
        return fillTime >= closedPosition.openedAt && fillTime <= closedPosition.closedAt;
      })
      .sort((a, b) => new Date(a.fillTime).getTime() - new Date(b.fillTime).getTime());

    console.log(`   📋 Creating ${relevantFills.length} transaction records for ${closedPosition.id}`);

    // Track position state to determine which fills close/reduce the position
    let netPosition = 0;
    const positionSide = closedPosition.side; // 'LONG' or 'SHORT'
    
    // Create transaction for each fill
    const batch = db.batch();
    let batchCount = 0;

    for (const fill of relevantFills) {
      const fillDate = new Date(fill.fillTime);
      const fillEurRate = await getDailyEurRate(fillDate, 'USD').catch(() => 0.85);
      const fillSize = Number(fill.size);
      
      // Update position state
      const previousNetPosition = netPosition;
      if (fill.side === 'buy') {
        netPosition += fillSize;
      } else {
        netPosition -= fillSize;
      }

      // Determine if this fill REDUCES the position (tax event candidate)
      let isReducing = false;
      if (positionSide === 'LONG') {
        // LONG position: SELL reduces it
        isReducing = fill.side === 'sell' && previousNetPosition > 0;
      } else {
        // SHORT position: BUY reduces it
        isReducing = fill.side === 'buy' && previousNetPosition < 0;
      }

      // Check if this is the final closing fill
      const isClosingFill = fill.fill_id === closedPosition.closingTradeId;

      const txRef = invRef.collection('transactions').doc(fill.fill_id);
      batch.set(txRef, {
        id: fill.fill_id,
        type: fill.side === 'buy' ? 'Buy' : 'Sell',
        date: fillDate.toISOString(),
        quantity: fillSize,
        pricePerUnit: Number(fill.price),
        totalAmount: fillSize * Number(fill.price) * fillEurRate,
        currency: 'EUR',
        exchangeRate: fillEurRate,
        valueInEur: fillSize * Number(fill.price) * fillEurRate,
        metadata: {
          // Mark as tax event if it reduces/closes the position
          isTaxEvent: isReducing || isClosingFill,
          orderId: fill.order_id,
          fillId: fill.fill_id,
          symbol: fill.symbol,
          side: fill.side,
          positionSide: positionSide,
          // Include aggregate data ONLY on the final closing fill
          ...(isClosingFill && {
            netRealizedPnlEur: closedPosition.netRealizedPnlEur,
            grossPnlEur: closedPosition.realizedPnlEur,
            feeEur: closedPosition.feeEur,
            fundingEur: closedPosition.fundingEur,
            isClosingFill: true,
          }),
        }
      });

      batchCount++;
      
      // Commit batch if it reaches 500 operations
      if (batchCount >= 500) {
        await batch.commit();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(`   ✅ Created investment wrapper with ${relevantFills.length} transactions for ${closedPosition.id}`);
  } catch (err) {
    console.error(`   ❌ Failed to create wrapper for ${closedPosition.id}:`, err);
  }
}

// --- MAIN SYNC FUNCTION ---
export async function syncKrakenFutures(userId: string) {
  if (!userId) return { ok: false, message: 'No User ID' };

  try {
    const db = adminDb;
    const metaRef = db.doc(`users/${userId}/metadata/kraken_sync`);
    
    // =========================================================================
    // PHASE 1: PROCESS HISTORY & CLOSED POSITIONS (Existing Logic)
    // =========================================================================
    
    const metaSnap = await metaRef.get();
    let lastLogId = metaSnap.data()?.lastLogId || 0;
    
    console.log(`🔄 Syncing Kraken Futures starting from Log ID: ${lastLogId}...`);

    let hasMore = true;
    let totalProcessed = 0;
    let totalClosed = 0;
    const BATCH_SIZE = 500; 
    const rateCache = new Map<string, number>();

    // Helper for current rate (used in Phase 2)
    const getRate = async (date: Date) => {
      const key = date.toISOString().split('T')[0];
      if (rateCache.has(key)) return rateCache.get(key)!;
      const rate = await getDailyEurRate(date, 'USD').catch(() => 0.85); 
      rateCache.set(key, rate);
      return rate;
    };

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
        const eurRate = await getRate(logDate);

        const realizedVal = Number(log.realized_pnl) || 0;
        const feeVal = Number(log.fee) || 0;
        const hasPnL = Math.abs(realizedVal) > 0.000001; 
        
        const realizedFunding = Number(log.realized_funding) || 0;
        let rawFundingAmount = 0;
        if (log.info === 'funding rate change') {
            if (Math.abs(realizedVal) > 0) rawFundingAmount = realizedVal;
            else if (Math.abs(realizedFunding) > 0) rawFundingAmount = realizedFunding;
        } else {
            rawFundingAmount = realizedFunding;
        }

        const fundingEur = rawFundingAmount * eurRate;
        const normalizedContract = log.contract ? log.contract.toLowerCase() : '';

        const logRef = db.collection('users').doc(userId).collection('kraken_logs').doc(log.booking_uid);
        logBatch.set(logRef, {
            id: log.booking_uid,
            logId: log.id,
            date: Timestamp.fromDate(logDate),
            type: log.info, 
            asset: log.asset,
            contract: normalizedContract, 
            amount: realizedVal, 
            fee: feeVal,
            amountEur: realizedVal * eurRate,
            feeEur: feeVal * eurRate,
            eurRate: eurRate,
            realizedFundingEur: fundingEur, 
            realizedPnlEur: hasPnL && log.info !== 'funding rate change' ? (realizedVal * eurRate) : 0,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        
        logBatchCount++;
      }

      if (logBatchCount > 0) await logBatch.commit();

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
          const eurRate = await getRate(logDate);

          const positionSide = matchingFill.side === 'buy' ? 'SHORT' : 'LONG';
          const size = Number(matchingFill.size);
          const exitPrice = Number(matchingFill.price);
          const realizedPnl = Number(log.realized_pnl);

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
          
          let totalFundingEur = await calculateFundingForPosition(userId, log.contract, openedAt, logDate);
          if (log.realized_funding) {
             totalFundingEur += (log.realized_funding * eurRate);
          }

          const realizedPnlEur = realizedPnl * eurRate;
          const feeEur = (log.fee || 0) * eurRate;
          const netRealizedPnlEur = realizedPnlEur - feeEur + totalFundingEur; 

          const docRef = db.collection('users').doc(userId).collection('futures_positions').doc(`CLOSED-${log.booking_uid}`);
          
          const closedPositionData = {
            id: `CLOSED-${log.booking_uid}`,
            status: 'CLOSED' as const,
            asset: formatTicker(matchingFill.symbol), 
            ticker: formatTicker(matchingFill.symbol) + '-PERP',
            side: positionSide,
            size: size,
            exitPrice: exitPrice,
            entryPrice: entryPrice,
            realizedPnL: realizedPnl,
            realizedPnlEur,
            feeEur,
            fundingEur: totalFundingEur, 
            netRealizedPnlEur,
            closingOrderId: matchingFill.order_id,
            closingTradeId: matchingFill.fill_id,
            openedAt: Timestamp.fromDate(openedAt),
            closedAt: Timestamp.fromDate(logDate),
            updatedAt: FieldValue.serverTimestamp(),
            exchangeRate: eurRate,
          };

          posBatch.set(docRef, closedPositionData, { merge: true });

          posBatchCount++;
          totalClosed++;
        }

        if (posBatchCount > 0) {
          await posBatch.commit();
          console.log(`      ✅ Saved ${posBatchCount} closed positions.`);
          
          // Create Investment wrappers for tax integration
          console.log(`      📋 Creating investment wrappers for tax integration...`);
          for (const log of closureLogs) {
            const matchingFill = allFillsMap.get(log.execution);
            if (!matchingFill) continue;

            const logDate = new Date(log.date);
            const eurRate = await getRate(logDate);
            const positionSide = matchingFill.side === 'buy' ? 'SHORT' : 'LONG';
            const size = Number(matchingFill.size);
            const exitPrice = Number(matchingFill.price);
            const realizedPnl = Number(log.realized_pnl);

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
            let totalFundingEur = await calculateFundingForPosition(userId, log.contract, openedAt, logDate);
            if (log.realized_funding) {
              totalFundingEur += (log.realized_funding * eurRate);
            }

            const realizedPnlEur = realizedPnl * eurRate;
            const feeEur = (log.fee || 0) * eurRate;
            const netRealizedPnlEur = realizedPnlEur - feeEur + totalFundingEur;

            await createInvestmentWrapperForClosedPosition(userId, {
              id: `CLOSED-${log.booking_uid}`,
              asset: formatTicker(matchingFill.symbol),
              ticker: formatTicker(matchingFill.symbol) + '-PERP',
              side: positionSide,
              size: size,
              entryPrice: entryPrice,
              exitPrice: exitPrice,
              realizedPnL: realizedPnl,
              realizedPnlEur,
              feeEur,
              fundingEur: totalFundingEur,
              netRealizedPnlEur,
              closingOrderId: matchingFill.order_id,
              closingTradeId: matchingFill.fill_id,
              openedAt,
              closedAt: logDate,
              exchangeRate: eurRate,
            }, allFills);
          }
        }
      }

      const maxIdInBatch = logs.reduce((max: number, l: KrakenLog) => l.id > max ? l.id : max, lastLogId);
      lastLogId = maxIdInBatch;
      
      await metaRef.set({ lastLogId: maxIdInBatch }, { merge: true });
      totalProcessed += logs.length;
      
      if (totalProcessed > 5000) break;
    }

    // =========================================================================
    // PHASE 2: SYNC LIVE OPEN POSITIONS
    // =========================================================================
    
    console.log('🔄 Syncing Live Open Positions...');
    
    // 1. Fetch live positions from Kraken API
    const openRes = await fetchKrakenOpenPositions();
    const livePositions = openRes.openPositions || [];
    
    // 2. Fetch recent fills to determine true "Opened At" date for continuous positions
    let recentFills: KrakenFill[] = [];
    if (livePositions.length > 0) {
        // FIX: Increase count to 500 to ensure we find the true start date
        // even if there were many recent scalping trades.
        // This prevents "wrong date" issues and ensures accurate funding calculations.
        const fillsRes = await fetchKrakenFills({ count: 500 });
        recentFills = fillsRes.fills || [];
    }

    const livePositionIds = new Set<string>();
    const today = new Date();
    const currentRate = await getRate(today);

    const openBatch = db.batch();
    
    for (const pos of livePositions) {
        const symbol = pos.symbol.toUpperCase();
        const docId = `OPEN-${symbol}`;
        livePositionIds.add(docId);
        
        const side = pos.side === 'long' ? 'LONG' : 'SHORT';
        const size = Number(pos.size);
        const entryPrice = Number(pos.price);
        const unrealizedFunding = Number(pos.unrealizedFunding || 0); 
        
        // A. Calculate correct Open Date by walking history
        const trueOpenedAt = findOpenDateForActivePosition(recentFills, symbol, size, side);
        
        // B. Calculate Historical Funding (from logs) + Unrealized Funding (from API)
        const historicalFundingEur = await calculateFundingForPosition(
            userId, 
            pos.symbol, // Pass raw symbol (e.g. pf_ethusd) which logic lowercases
            trueOpenedAt, 
            today
        );
        const currentUnrealizedEur = unrealizedFunding * currentRate;
        const totalFundingEur = historicalFundingEur + currentUnrealizedEur;

        const docRef = db.collection('users').doc(userId).collection('futures_positions').doc(docId);
        
        openBatch.set(docRef, {
            id: docId,
            status: 'OPEN',
            asset: formatTicker(symbol),
            ticker: formatTicker(symbol) + '-PERP',
            side: side,
            size: size,
            entryPrice: entryPrice,
            exchangeRate: currentRate,
            
            // This now includes BOTH realized history + current session
            fundingEur: totalFundingEur, 
            
            // Corrected Open Date
            openedAt: Timestamp.fromDate(trueOpenedAt),
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    }
    
    // 3. CLEANUP: Delete positions in DB that are 'OPEN' but not in Kraken's live list
    // This prevents "Ghost" positions if you just closed one.
    const existingOpenSnap = await db.collection('users').doc(userId).collection('futures_positions')
        .where('status', '==', 'OPEN')
        .get();
        
    let deletedCount = 0;
    existingOpenSnap.forEach((doc) => {
        if (!livePositionIds.has(doc.id)) {
            openBatch.delete(doc.ref);
            deletedCount++;
        }
    });

    await openBatch.commit();
    console.log(`   ✅ Open Positions Synced: ${livePositions.length} active, ${deletedCount} removed.`);

    return { 
        ok: true, 
        message: `Synced. Processed ${totalProcessed} logs, found ${totalClosed} closures. Open Positions: ${livePositions.length}.` 
    };

  } catch (error: any) {
    console.error('Sync Error:', error);
    return { ok: false, message: error.message };
  }
}