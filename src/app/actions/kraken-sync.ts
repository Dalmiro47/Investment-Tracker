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
  realized_funding?: number;
  fee: number;
  old_average_entry_price?: number;
  new_average_entry_price?: number; 
  execution: string; 
  amount?: number; // Raw amount from API
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

function formatTicker(rawSymbol: string): string {
  return rawSymbol.replace(/^(PF_|PI_|FI_)/, '').replace(/USD$/, '');
}

/**
 * FIXED HISTORY WALKER (Sign Flip Logic)
 * Detects when the position actually flipped side (e.g. Long -> Short)
 * to find the TRUE open date, ignoring dust/noise.
 */
function findOpenDateForClosure(allFills: KrakenFill[], currentFill: KrakenFill): Date {
  const history = allFills
    .filter(f => f.symbol === currentFill.symbol && new Date(f.fillTime) <= new Date(currentFill.fillTime))
    .sort((a, b) => new Date(b.fillTime).getTime() - new Date(a.fillTime).getTime());

  if (history.length === 0) return new Date(currentFill.fillTime);

  // If we SOLD to close, we were LONG.
  const wasLong = currentFill.side === 'sell'; 
  let virtualPosition = 0; 

  for (const fill of history) {
    const fillSize = Number(fill.size);
    
    // Reverse the timeline:
    // If fill was BUY, we subtract (we had less before).
    // If fill was SELL, we add (we had more before).
    if (fill.side === 'buy') virtualPosition -= fillSize;
    else virtualPosition += fillSize;

    // 1. Exact Zero Check
    if (Math.abs(virtualPosition) < 0.000001) return new Date(fill.fillTime);

    // 2. SIGN FLIP CHECK (Critical Fix for 19/12 vs 22/12)
    // If we were LONG (Pos), and virtual pos becomes Negative, we crossed into previous Short cycle.
    if (wasLong && virtualPosition < -0.000001) return new Date(fill.fillTime);
    // If we were SHORT (Neg), and virtual pos becomes Positive, we crossed into previous Long cycle.
    if (!wasLong && virtualPosition > 0.000001) return new Date(fill.fillTime);
  }

  return new Date(history[history.length - 1].fillTime);
}
// NEW: History Walker for OPEN positions (Finds start of current active position)
function findOpenDateForActivePosition(
  allFills: KrakenFill[], 
  symbol: string, 
  currentSize: number, 
  side: 'LONG' | 'SHORT'
): Date {
  const history = allFills
    .filter(f => formatTicker(f.symbol) === formatTicker(symbol)) 
    .sort((a, b) => new Date(b.fillTime).getTime() - new Date(a.fillTime).getTime());

  if (history.length === 0) return new Date();

  let netPosition = side === 'LONG' ? currentSize : -currentSize;

  for (const fill of history) {
    const fillSize = Number(fill.size);
    if (fill.side === 'buy') netPosition -= fillSize; 
    else netPosition += fillSize; 

    if (Math.abs(netPosition) < 0.0001) return new Date(fill.fillTime);
    
    const isLong = side === 'LONG';
    if ((isLong && netPosition < 0) || (!isLong && netPosition > 0)) {
       return new Date(fill.fillTime);
    }
  }
  return new Date(history[history.length - 1].fillTime);
}
function calculateFallbackEntry(
  exitPrice: number, 
  size: number, 
  pnl: number, 
  positionSide: 'LONG' | 'SHORT'
): number {
  if (size === 0) return 0;
  const priceDelta = pnl / size;
  return positionSide === 'LONG' ? exitPrice - priceDelta : exitPrice + priceDelta;
}

/**
 * FIXED FUNDING CALCULATION
 * 1. Returns RAW USD Amount + EUR Amount.
 * 2. Removes strict contract filter (uses loose match).
 * 3. Logs the total USD found for debugging.
 */
async function calculateFundingForPosition(
  userId: string, 
  contract: string, 
  start: Date, 
  end: Date
): Promise<{ fundingUsd: number, fundingEur: number }> {
  try {
    const db = adminDb;
    const logsRef = db.collection('users').doc(userId).collection('kraken_logs');
    
    const targetAsset = contract.replace(/^(PF_|PI_|FI_)/i, '').replace(/USD$/i, '').toUpperCase();
    const searchContract = contract.toUpperCase();

    const bufferedStart = new Date(start);
    bufferedStart.setHours(bufferedStart.getHours() - 4);
    const bufferedEnd = new Date(end);
    bufferedEnd.setHours(bufferedEnd.getHours() + 4);

    const snapshot = await logsRef
      .where('type', '==', 'funding rate change')
      .where('date', '>=', Timestamp.fromDate(bufferedStart))
      .where('date', '<=', Timestamp.fromDate(bufferedEnd))
      .get();

    if (snapshot.empty) return { fundingUsd: 0, fundingEur: 0 };

    let totalFundingUsd = 0;
    let totalFundingEur = 0;

    // We process sequentially to ensure rate fetching doesn't race condition the cache excessively
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const logContract = (data.contract || '').toUpperCase();
      const logAsset = (data.asset || '').toUpperCase();
      
      const isMatch = 
        logContract === searchContract || 
        logContract.includes(targetAsset) ||
        logAsset.includes(targetAsset);

      if (isMatch) {
         // PREFER 'amountUsd' if available (new logic), else 'amount', else 'realizedFunding'
         const valUsd = Number(data.amountUsd) || Number(data.amount) || Number(data.realizedFunding) || 0;
         const valEur = Number(data.realizedFundingEur) || 0;
         
         totalFundingUsd += valUsd;
         // If EUR is missing or 0 in DB, calculate it on fly? 
         // Ideally rely on what was saved, but for reconciliation we might want to recalc.
         totalFundingEur += valEur;
      }
    }

    return { fundingUsd: totalFundingUsd, fundingEur: totalFundingEur };
  } catch (err) {
    console.error('Error calculating funding:', err);
    return { fundingUsd: 0, fundingEur: 0 };
  }
}


// Wrapper for CSV Audit
async function createInvestmentWrapperForClosedPosition(
  userId: string,
  closedPosition: any,
  allFills: KrakenFill[]
) {
  try {
    const db = adminDb;
    const invRef = db.collection('users').doc(userId).collection('investments').doc(closedPosition.id);
    
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
      _futuresPositionRef: `futures_positions/${closedPosition.id}`,
    }, { merge: true });

    const relevantFills = allFills
      .filter(f => formatTicker(f.symbol) === closedPosition.asset)
      .filter(f => {
        const fillTime = new Date(f.fillTime);
        return fillTime >= closedPosition.openedAt && fillTime <= closedPosition.closedAt;
      })
      .sort((a, b) => new Date(a.fillTime).getTime() - new Date(b.fillTime).getTime());

    let netPosition = 0;
    const positionSide = closedPosition.side; 
    
    const batch = db.batch();
    let batchCount = 0;

    for (const fill of relevantFills) {
      const fillDate = new Date(fill.fillTime);
      const fillEurRate = await getDailyEurRate(fillDate, 'USD').catch(() => 0.85);
      const fillSize = Number(fill.size);
      
      const previousNetPosition = netPosition;
      if (fill.side === 'buy') netPosition += fillSize;
      else netPosition -= fillSize;

      let isReducing = false;
      if (positionSide === 'LONG') isReducing = fill.side === 'sell' && previousNetPosition > 0;
      else isReducing = fill.side === 'buy' && previousNetPosition < 0;

      const isClosingFill = fill.fill_id === closedPosition.closingTradeId;

      const txRef = invRef.collection('transactions').doc(fill.fill_id);
      
      // FORCE NUMBER TYPES: Prevents "String" pollution in the DB
      const qtyNum = Number(fillSize) || 0;
      const priceNum = Number(fill.price) || 0;
      const eurRateNum = Number(fillEurRate) || 0;
      const valEurNum = Number((qtyNum * priceNum * eurRateNum).toFixed(4)); // Fix precision to 4 decimals

      batch.set(txRef, {
        id: fill.fill_id,
        type: fill.side === 'buy' ? 'Buy' : 'Sell',
        date: fillDate.toISOString(),
        
        // 1. Force Numbers on main fields
        quantity: qtyNum,
        pricePerUnit: priceNum,
        totalAmount: valEurNum,
        currency: 'EUR',
        exchangeRate: eurRateNum,
        valueInEur: valEurNum,
        
        metadata: {
          isTaxEvent: isReducing || isClosingFill,
          orderId: fill.order_id,
          fillId: fill.fill_id,
          symbol: fill.symbol,
          side: fill.side,
          positionSide: positionSide,
          
          // 2. CRITICAL: Force Numbers on Metadata (Columns G-M in CSV)
          ...(isClosingFill && {
            netRealizedPnlEur: Number(closedPosition.netRealizedPnlEur) || 0,
            grossPnlEur: Number(closedPosition.realizedPnlEur) || 0,
            feeEur: Number(closedPosition.feeEur) || 0,
            fundingEur: Number(closedPosition.fundingEur) || 0,
            isClosingFill: true,
          }),
        }
      });

      batchCount++;
      if (batchCount >= 500) {
        await batch.commit();
        batchCount = 0;
      }
    }

    if (batchCount > 0) await batch.commit();

  } catch (err) {
    console.error(`Failed to create wrapper for ${closedPosition.id}:`, err);
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
            amount: realizedVal, // PnL Amount
            amountUsd: rawFundingAmount, // NEW: Explicitly store USD Funding Amount
            fee: feeVal,
            amountEur: realizedVal * eurRate,
            feeEur: feeVal * eurRate,
            eurRate: eurRate,
            realizedFunding: rawFundingAmount, // USD
            realizedFundingEur: fundingEur, // EUR
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
          
          // Preliminary calc (will be fixed in Phase 1.5)
          const realizedPnlEur = realizedPnl * eurRate;
          const feeEur = (log.fee || 0) * eurRate;
          // Temporarily set funding to 0 or simple calc, Phase 1.5 will overwrite
          const netRealizedPnlEur = realizedPnlEur - feeEur; 

          const docRef = db.collection('users').doc(userId).collection('futures_positions').doc(`CLOSED-${log.booking_uid}`);
          
          posBatch.set(docRef, {
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
            fundingEur: 0, // Placeholder
            netRealizedPnlEur,
            closingOrderId: matchingFill.order_id,
            closingTradeId: matchingFill.fill_id,
            openedAt: Timestamp.fromDate(openedAt),
            closedAt: Timestamp.fromDate(logDate),
            updatedAt: FieldValue.serverTimestamp(),
            exchangeRate: eurRate,
          }, { merge: true });

          posBatchCount++;
          totalClosed++;
        }

        if (posBatchCount > 0) {
          await posBatch.commit();
          console.log(`      ✅ Saved ${posBatchCount} closed positions.`);

          // --- MISSING PART RESTORED ---
          // Now create the granular Investment Wrappers (Transactions)
          console.log(`      🔄 Creating Investment Wrappers for ${closureLogs.length} positions...`);
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
              if (newEntry > 0) entryPrice = newEntry;
              else entryPrice = calculateFallbackEntry(exitPrice, size, realizedPnl, positionSide as any);
            }

            const openedAt = findOpenDateForClosure(allFills, matchingFill);
            
            // Preliminary Calc for Phase 1 (Phase 1.5 will refine Funding)
            const realizedPnlEur = realizedPnl * eurRate;
            const feeEur = (log.fee || 0) * eurRate;
            let fundingEur = 0; // Will be fixed in Phase 1.5
            const netRealizedPnlEur = realizedPnlEur - feeEur;

            // Call the Wrapper Creator
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
              fundingEur,
              netRealizedPnlEur,
              closingOrderId: matchingFill.order_id,
              closingTradeId: matchingFill.fill_id,
              openedAt: openedAt,
              closedAt: logDate,
              exchangeRate: eurRate,
            }, allFills);
          }
          console.log(`      ✅ Investment Wrappers created successfully.`);
          // -----------------------------
        }
      }

      const maxIdInBatch = logs.reduce((max: number, l: KrakenLog) => l.id > max ? l.id : max, lastLogId);
      lastLogId = maxIdInBatch;
      
      await metaRef.set({ lastLogId: maxIdInBatch }, { merge: true });
      totalProcessed += logs.length;
      
      if (totalProcessed > 5000) break;
    }

    // =========================================================================
    // PHASE 1.5: RECONCILE SESSIONS (The Fix for Double Funding & Date Sync)
    // =========================================================================
    
    console.log('🔄 Phase 1.5: Reconciling Sessions...');
    const closedSnap = await db.collection('users').doc(userId).collection('futures_positions')
        .where('status', '==', 'CLOSED').get();
    
    const closedDocs = closedSnap.docs.map(d => d.data());
    // Group by Ticker
    const groupedByTicker: Record<string, any[]> = {};
    for (const doc of closedDocs) {
        if (!groupedByTicker[doc.ticker]) groupedByTicker[doc.ticker] = [];
        groupedByTicker[doc.ticker].push(doc);
    }

    const reconcileBatch = db.batch();
    let reconcileCount = 0;

    for (const ticker in groupedByTicker) {
        // Sort by ClosedAt
        const docs = groupedByTicker[ticker].sort((a,b) => a.closedAt.toMillis() - b.closedAt.toMillis());
        
        // Identify Sessions (Gap > 48h = New Session)
        const sessions: any[][] = [];
        let currentSession: any[] = [];
        
        for (const doc of docs) {
            if (currentSession.length === 0) {
                currentSession.push(doc);
            } else {
                const lastDoc = currentSession[currentSession.length - 1];
                const timeGap = doc.closedAt.toMillis() - lastDoc.closedAt.toMillis();
                const isSameSession = timeGap < (48 * 60 * 60 * 1000); // 48h threshold
                
                if (isSameSession) {
                    currentSession.push(doc);
                } else {
                    sessions.push(currentSession);
                    currentSession = [doc];
                }
            }
        }
        if (currentSession.length > 0) sessions.push(currentSession);

        // Process Each Session
        for (const session of sessions) {
            if (session.length === 0) continue;
            
            // 1. Find Earliest Open Date (The Truth)
            const timestamps = session.map(d => d.openedAt.toMillis());
            const minOpenTime = Math.min(...timestamps);
            const sessionOpenedAt = new Date(minOpenTime);
            
            // 2. Find Latest Close Date
            const maxCloseTime = Math.max(...session.map(d => d.closedAt.toMillis()));
            const sessionClosedAt = new Date(maxCloseTime);
            
            // 3. Calc Total Funding for this Window ONCE
            // Note: pass raw symbol (e.g. PF_ETHUSD) if available, else construct it
            // Assuming ticker is "ETH-PERP", raw might need reconstruction or use what's in doc.asset
            const rawContract = session[0].ticker.replace('-PERP', 'USD'); // Approximation or use doc.asset
            
            const fundingData = await calculateFundingForPosition(
                userId, rawContract, sessionOpenedAt, sessionClosedAt
            );
            
            console.log(`🔎 Session ${session[0].ticker} (${sessionOpenedAt.toISOString()} - ${sessionClosedAt.toISOString()})`);
            console.log(`   --> Total USD Funding: $${fundingData.fundingUsd.toFixed(4)}`);
            console.log(`   --> Total EUR Funding: €${fundingData.fundingEur.toFixed(4)}`);
            
            // 4. Distribute
            const totalVolume = session.reduce((sum, d) => sum + (Number(d.size)||0), 0);
            
            for (const doc of session) {
                const size = Number(doc.size) || 0;
                const ratio = totalVolume > 0 ? (size / totalVolume) : 0;
                const allocatedFunding = ratio * fundingData.fundingEur;
                
                // Recalc Net PnL
                const newNetPnL = (doc.realizedPnlEur || 0) - (doc.feeEur || 0) + allocatedFunding;
                
                const docRef = db.collection('users').doc(userId).collection('futures_positions').doc(doc.id);
                
                // Update Firestore
                reconcileBatch.set(docRef, {
                    openedAt: Timestamp.fromDate(sessionOpenedAt), // Align Date
                    fundingEur: allocatedFunding,
                    netRealizedPnlEur: newNetPnL,
                    updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });

                // Also update Investment Wrapper
                const invRef = db.collection('users').doc(userId).collection('investments').doc(doc.id);
                reconcileBatch.set(invRef, {
                    purchaseDate: sessionOpenedAt.toISOString(),
                    realizedPnL: newNetPnL,
                    updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });

                // CRITICAL: Update Transaction Metadata for Audit CSV
                if (doc.closingTradeId) {
                    const txRef = invRef.collection('transactions').doc(doc.closingTradeId);
                    // We need to use update() or set() with deep merge carefully
                    // Firestore set merge matches top level. To merge metadata safely:
                    reconcileBatch.set(txRef, {
                        metadata: {
                            fundingEur: allocatedFunding,
                            netRealizedPnlEur: newNetPnL
                        }
                    }, { merge: true });
                }
                
                reconcileCount++;
            }
        }
    }
    
    if (reconcileCount > 0) {
        await reconcileBatch.commit();
        console.log(`   ✅ Reconciled ${reconcileCount} closed positions (Funding & Dates corrected).`);
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
        const fundingData = await calculateFundingForPosition(
            userId, 
            pos.symbol, // Pass raw symbol (e.g. pf_ethusd) which logic lowercases
            trueOpenedAt, 
            today
        );
        const currentUnrealizedEur = unrealizedFunding * currentRate;
        const totalFundingEur = fundingData.fundingEur + currentUnrealizedEur;

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
        message: `Synced. Processed ${totalProcessed} logs, found ${totalClosed} closures. Reconciled ${reconcileCount}. Open: ${livePositions.length}.` 
    };

  } catch (error: any) {
    console.error('Sync Error:', error);
    return { ok: false, message: error.message };
  }
}