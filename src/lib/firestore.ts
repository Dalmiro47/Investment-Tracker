

import { collection, addDoc, getDocsFromServer, doc, updateDoc, deleteDoc, Timestamp, writeBatch, runTransaction, getDoc, serverTimestamp, query, where, getDocs, collectionGroup, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Investment, Transaction, TransactionFormValues, InvestmentFormValues, TaxSettings, EtfSimSummary } from './types';
import type { SavingsRateChange } from './types-savings';
import { buildInvestmentId, toSlug } from './ids';

const investmentsCol = (uid: string) => collection(db, 'users', uid, 'investments');
const txCol = (uid: string, invId: string) => collection(db, 'users', uid, 'investments', invId, 'transactions');
const settingsDoc = (uid: string, docId: string) => doc(db, 'users', uid, 'settings', docId);


const toTS = (d: Date) => Timestamp.fromDate(d);

const fromInvestmentDoc = (snap: any): Investment => {
  const d = snap.data();
  
  // Safely handle purchaseDate conversion
  let purchaseDate: string | undefined;
  try {
    if (d.purchaseDate?.toDate) {
      purchaseDate = d.purchaseDate.toDate().toISOString();
    } else if (d.purchaseDate) {
      const date = new Date(d.purchaseDate);
      purchaseDate = isNaN(date.getTime()) ? undefined : date.toISOString();
    }
  } catch (e) {
    console.warn('Invalid purchaseDate for investment', snap.id, e);
    purchaseDate = undefined;
  }
  
  return {
    id: snap.id,
    ...d,
    purchaseDate,
    createdAt: d.createdAt?.toDate?.().toISOString() ?? undefined,
    updatedAt: d.updatedAt?.toDate?.().toISOString() ?? undefined,
  } as Investment;
};

const fromTxDoc = (snap: any): Transaction => {
  const d = snap.data();
  const dt = (d.date?.toDate ? d.date.toDate() : new Date(d.date)) as Date;
  return {
    id: snap.id,
    ...d,
    date: dt.toISOString(),
  } as Transaction;
};

export async function getInvestments(uid: string): Promise<Investment[]> {
  const q = await getDocsFromServer(query(investmentsCol(uid)));
  return q.docs.map(fromInvestmentDoc);
}

export async function addInvestment(
  uid: string,
  data: InvestmentFormValues,
  initialRatePct?: number
): Promise<string> {

  const id = buildInvestmentId(uid, data);

  const investmentData = {
    ...data,
    purchaseDate: toTS(data.purchaseDate),
    currentValue: data.type === 'Interest Account' ? 0 : data.purchasePricePerUnit,
    totalSoldQty: 0,
    realizedProceeds: 0,
    realizedPnL: 0,
    dividends: 0,
    interest: 0,
    status: 'Active',
    slug: toSlug(data.ticker || data.name || data.type),
    symbol: data.ticker ?? null,
    createdAt: serverTimestamp(),
  };
  
  const newDocRef = doc(db, `users/${uid}/investments/${id}`);
  await setDoc(newDocRef, investmentData);

  if (data.type === 'Interest Account' && typeof initialRatePct === 'number') {
      const rateScheduleRef = collection(db, 'users', uid, 'investments', newDocRef.id, 'rateSchedule');
      await addDoc(rateScheduleRef, {
        from: data.purchaseDate.toISOString().slice(0,10),
        annualRatePct: initialRatePct,
      });
  }
  return newDocRef.id;
}

export async function updateInvestment(uid: string, invId: string, patch: Partial<InvestmentFormValues>) {
  const ref = doc(db, 'users', uid, 'investments', invId);
  const payload: any = { ...patch };
  if (patch.purchaseDate) payload.purchaseDate = toTS(patch.purchaseDate);
  await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
}

export async function deleteInvestment(uid: string, invId: string) {
  const invRef = doc(db, 'users', uid, 'investments', invId);
  const txSnap = await getDocsFromServer(txCol(uid, invId));
  const ratesSnap = await getDocsFromServer(collection(db, invRef.path, 'rateSchedule'));
  
  const batch = writeBatch(db);
  txSnap.forEach(d => batch.delete(d.ref));
  ratesSnap.forEach(d => batch.delete(d.ref));
  batch.delete(invRef);
  
  await batch.commit();
}

export async function getTransactions(uid: string, invId: string): Promise<Transaction[]> {
  const q = await getDocsFromServer(query(txCol(uid, invId)));
  return q.docs.map(fromTxDoc).sort((a,b) => +new Date(b.date) - +new Date(a.date));
}

// Fetch all transactions for a given list of investments in parallel
export async function getAllTransactionsForInvestments(
  userId: string,
  investments: Investment[],
): Promise<Record<string, Transaction[]>> {
  const transactionPromises = investments.map(inv => getTransactions(userId, inv.id));
  const transactionsArrays = await Promise.all(transactionPromises);

  const transactionsMap: Record<string, Transaction[]> = {};
  investments.forEach((inv, index) => {
    transactionsMap[inv.id] = transactionsArrays[index];
  });
  
  return transactionsMap;
}

export async function getRateSchedule(uid: string, invId: string): Promise<SavingsRateChange[]> {
    const q = await getDocsFromServer(query(collection(db, 'users', uid, 'investments', invId, 'rateSchedule')));
    return q.docs.map(d => d.data() as SavingsRateChange).sort((a, b) => a.from.localeCompare(b.from));
}

export async function getAllRateSchedules(
  userId: string,
  investments: Investment[]
): Promise<Record<string, SavingsRateChange[]>> {
    const interestAccounts = investments.filter(i => i.type === 'Interest Account');
    const promises = interestAccounts.map(inv => getRateSchedule(userId, inv.id));
    const results = await Promise.all(promises);
    const map: Record<string, SavingsRateChange[]> = {};
    interestAccounts.forEach((inv, index) => {
        map[inv.id] = results[index];
    });
    return map;
}

export async function getAllEtfSummaries(uid: string): Promise<EtfSimSummary[]> {
  // list user's ETF plans
  const plansRef = collection(db, 'users', uid, 'etfPlans');
  const plansSnap = await getDocsFromServer(plansRef);

  // fetch each plan's latest summary doc in parallel
  const reads = plansSnap.docs.map(async (p) => {
    const sRef = doc(db, 'users', uid, 'etfPlans', p.id, 'latest_sim_summary', 'latest');
    const sSnap = await getDoc(sRef);
    return sSnap.exists() ? (sSnap.data() as EtfSimSummary) : null;
  });

  const results = await Promise.all(reads);
  return results.filter((x): x is EtfSimSummary => !!x);
}

export async function getSellYears(userId: string): Promise<number[]> {
  // NOTE: A collectionGroup query requires a specific rule and index.
  // To avoid this complexity, we fetch all investments for the user
  // and then derive the sell years from their transactions.
  const allInvestments = await getInvestments(userId);
  const txMap = await getAllTransactionsForInvestments(userId, allInvestments);

  const years = new Set<number>();
  Object.values(txMap).flat().forEach(tx => {
    if (tx.type === 'Sell') {
      years.add(new Date(tx.date).getFullYear());
    }
  });

  const sortedYears = Array.from(years).sort((a, b) => b - a);

  // Ensure current year is included if no sales have been made
  const currentYear = new Date().getFullYear();
  if (!sortedYears.includes(currentYear)) {
    sortedYears.push(currentYear);
  }

  return sortedYears.sort((a,b) => b-a);
}


export async function addTransaction(uid: string, invId: string, t: TransactionFormValues) {
  await runTransaction(db, async (tx) => {
    const invRef = doc(db, 'users', uid, 'investments', invId);
    const invSnap = await tx.get(invRef);
    if (!invSnap.exists()) throw new Error('Investment not found');

    const inv = fromInvestmentDoc(invSnap);

    if (inv.type === 'Interest Account' && (t.type === 'Sell' || t.type === 'Dividend' || t.type === 'Interest')) {
      throw new Error('Interest Accounts only support Deposit and Withdrawal.');
    }
    
    // prevent oversell
    if (t.type === 'Sell') {
      const available = Math.max(0, (inv.purchaseQuantity ?? 0) - (inv.totalSoldQty ?? 0));
      if (t.quantity > available + 1e-8) {
        throw new Error(`Sell quantity exceeds available quantity (${available}).`);
      }
    }

    // Current aggregates (defaulting to 0)
    let totalSoldQty      = inv.totalSoldQty      ?? 0;
    let realizedProceeds  = inv.realizedProceeds  ?? 0;
    let realizedPnL       = inv.realizedPnL       ?? 0;
    let dividends         = inv.dividends         ?? 0;
    let interest          = inv.interest          ?? 0;

    // Prepare new tx doc
    const newTxRef = doc(txCol(uid, invId));

    let txQuantity    = 0;
    let txPricePerUnit = 0;
    let txTotalAmount = 0;

    if (t.type === 'Sell') {
      txQuantity     = t.quantity;
      txPricePerUnit = t.pricePerUnit;
      txTotalAmount  = t.quantity * t.pricePerUnit;

      // Increment aggregates from SELL
      totalSoldQty     += t.quantity;
      realizedProceeds += txTotalAmount;
      realizedPnL      += (t.pricePerUnit - inv.purchasePricePerUnit) * t.quantity;

    } else if (t.type === 'Dividend') {
      txTotalAmount = t.amount;
      dividends    += t.amount;

    } else if (t.type === 'Interest') {
      txTotalAmount = t.amount;
      interest     += t.amount;
    } else if (t.type === 'Deposit') {
        txTotalAmount = t.amount;
    } else if (t.type === 'Withdrawal') {
        txTotalAmount = -t.amount;
    }

    // Recompute status from available qty
    const availableQty = Math.max(0, (inv.purchaseQuantity ?? 0) - totalSoldQty);
    const status: Investment['status'] =
      inv.type === 'Interest Account' ? 'Active' : (availableQty > 1e-6 ? 'Active' : 'Sold');

    // 1) Update parent aggregates atomically
    tx.update(invRef, {
      totalSoldQty,
      realizedProceeds,
      realizedPnL,
      dividends,
      interest,
      status,
      updatedAt: serverTimestamp(),
    });

    // 2) Create the tx document
    tx.set(newTxRef, {
      type: t.type,
      date: toTS(t.date),
      quantity: txQuantity,
      pricePerUnit: txPricePerUnit,
      totalAmount: txTotalAmount,
    });
  });
}

const calculateDeltas = (
  oldTx: Transaction, 
  newTxData: TransactionFormValues, 
  purchasePrice: number
) => {
  const deltas = {
    soldQty: 0,
    proceeds: 0,
    realizedPnL: 0,
    dividends: 0,
    interest: 0,
  };

  let newTotalAmount = 0;
  if (newTxData.type === 'Sell') {
      newTotalAmount = newTxData.quantity * newTxData.pricePerUnit;
  } else if (newTxData.type === 'Deposit') {
      newTotalAmount = newTxData.amount;
  } else if (newTxData.type === 'Withdrawal') {
      newTotalAmount = -newTxData.amount;
  } else {
      newTotalAmount = newTxData.amount;
  }
  
  // Back out old values
  if (oldTx.type === 'Sell') {
    deltas.soldQty -= oldTx.quantity;
    deltas.proceeds -= oldTx.totalAmount;
    deltas.realizedPnL -= (oldTx.pricePerUnit - purchasePrice) * oldTx.quantity;
  } else if (oldTx.type === 'Dividend') {
    deltas.dividends -= oldTx.totalAmount;
  } else if (oldTx.type === 'Interest') {
    deltas.interest -= oldTx.totalAmount;
  }
  
  // Add in new values
  if (newTxData.type === 'Sell') {
    deltas.soldQty += newTxData.quantity;
    deltas.proceeds += newTotalAmount;
    deltas.realizedPnL += (newTxData.pricePerUnit - purchasePrice) * newTxData.quantity;
  } else if (newTxData.type === 'Dividend') {
    deltas.dividends += newTotalAmount;
  } else if (newTxData.type === 'Interest') {
    deltas.interest += newTotalAmount;
  }

  return { deltas, newTotalAmount };
};


export async function updateTransaction(uid: string, invId: string, txId: string, newTxData: TransactionFormValues) {
  await runTransaction(db, async (transaction) => {
    const invRef = doc(db, 'users', uid, 'investments', invId);
    const txRef = doc(db, 'users', uid, 'investments', invId, 'transactions', txId);

    // READS
    const invSnap = await transaction.get(invRef);
    if (!invSnap.exists()) throw new Error('Investment not found');
    const inv = fromInvestmentDoc(invSnap);

    if (inv.type === 'Interest Account' && (newTxData.type === 'Sell' || newTxData.type === 'Dividend' || newTxData.type === 'Interest')) {
      throw new Error('Interest Accounts only support Deposit and Withdrawal.');
    }

    const oldTxSnap = await transaction.get(txRef);
    if (!oldTxSnap.exists()) throw new Error('Transaction to update not found');
    const oldTx = fromTxDoc(oldTxSnap);
    
    // CALCULATE
    const { deltas, newTotalAmount } = calculateDeltas(oldTx, newTxData, inv.purchasePricePerUnit);

    const totalSoldQty = (inv.totalSoldQty ?? 0) + deltas.soldQty;
    
    if (totalSoldQty > inv.purchaseQuantity + 1e-8) {
      const available = Math.max(0, inv.purchaseQuantity - (inv.totalSoldQty ?? 0));
      throw new Error(`Sell quantity exceeds available quantity (${available}).`);
    }

    const availableQty = Math.max(0, inv.purchaseQuantity - totalSoldQty);
    const status: Investment['status'] = 
      inv.type === 'Interest Account' ? 'Active' : (availableQty > 1e-6 ? 'Active' : 'Sold');
    
    // WRITES
    // 1) Update parent investment with deltas
    transaction.update(invRef, {
      totalSoldQty,
      realizedProceeds: (inv.realizedProceeds ?? 0) + deltas.proceeds,
      realizedPnL: (inv.realizedPnL ?? 0) + deltas.realizedPnL,
      dividends: (inv.dividends ?? 0) + deltas.dividends,
      interest: (inv.interest ?? 0) + deltas.interest,
      status,
      updatedAt: serverTimestamp(),
    });

    // 2) Update the transaction document itself
    transaction.update(txRef, {
      type: newTxData.type,
      date: toTS(newTxData.date),
      quantity: newTxData.type === 'Sell' ? newTxData.quantity : 0,
      pricePerUnit: newTxData.type === 'Sell' ? newTxData.pricePerUnit : 0,
      totalAmount: newTotalAmount,
    });
  });
}

export async function deleteTransaction(uid: string, invId: string, txId: string) {
    await runTransaction(db, async (transaction) => {
        const invRef = doc(db, 'users', uid, 'investments', invId);
        const txRef = doc(db, 'users', uid, 'investments', invId, 'transactions', txId);

        // READS
        const invSnap = await transaction.get(invRef);
        if (!invSnap.exists()) throw new Error('Investment not found');
        const inv = fromInvestmentDoc(invSnap);
        
        const txToDeleteSnap = await transaction.get(txRef);
        if (!txToDeleteSnap.exists()) return; // Already deleted, nothing to do.
        const txToDelete = fromTxDoc(txToDeleteSnap);

        // CALCULATE
        const { deltas } = calculateDeltas(txToDelete, { type: 'Sell', date: new Date(), quantity: 0, pricePerUnit: 0, amount: 0 }, inv.purchasePricePerUnit);

        const totalSoldQty = (inv.totalSoldQty ?? 0) + deltas.soldQty;
        const availableQty = Math.max(0, inv.purchaseQuantity - totalSoldQty);
        const status: Investment['status'] =
          inv.type === 'Interest Account' ? 'Active' : (availableQty > 1e-6 ? 'Active' : 'Sold');

        // WRITES
        // 1) Update parent investment by subtracting the old transaction's values
        transaction.update(invRef, {
            totalSoldQty,
            realizedProceeds: (inv.realizedProceeds ?? 0) + deltas.proceeds,
            realizedPnL: (inv.realizedPnL ?? 0) + deltas.realizedPnL,
            dividends: (inv.dividends ?? 0) + deltas.dividends,
            interest: (inv.interest ?? 0) + deltas.interest,
            status,
            updatedAt: serverTimestamp(),
        });

        // 2) Delete the actual transaction document
        transaction.delete(txRef);
    });
}


// --- TAX SETTINGS ---

export async function getTaxSettings(uid: string): Promise<TaxSettings | null> {
  const ref = settingsDoc(uid, 'tax');
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data() as TaxSettings;
  }
  return null;
}

export async function updateTaxSettings(uid: string, settings: TaxSettings) {
  const ref = settingsDoc(uid, 'tax');
  await setDoc(ref, settings, { merge: true });
}

export async function addRateChange(
  uid: string,
  invId: string,
  change: { from: string; annualRatePct: number }
) {
  const ref = collection(db, 'users', uid, 'investments', invId, 'rateSchedule');
  await addDoc(ref, change);
}

export async function processFifoSell(
  uid: string, 
  symbol: string, 
  data: { date: Date; quantity: number; pricePerUnit: number; exchange?: string }
) {
  // 1. Identify candidates: Query all active investments with this symbol AND exchange
  const constraints = [
    where('symbol', '==', symbol), 
    where('status', '==', 'Active')
  ];

  if (data.exchange === "null_sentinel") {
    // User specifically wants items with NO exchange defined (legacy data)
    // Note: Firestore cannot query for 'undefined', so we usually query for 'exchange' == null 
    // OR we just fetch all and filter in memory if the dataset is small.
    // Since we are already fetching candidates, let's filter in memory below to be safe.
  } else if (data.exchange) {
    constraints.push(where('exchange', '==', data.exchange));
  }
  
  const q = query(investmentsCol(uid), ...constraints);
  
  const snap = await getDocs(q);
  let candidates = snap.docs.map(fromInvestmentDoc);

  // --- ADD THIS MEMORY FILTER ---
  if (data.exchange === "null_sentinel") {
      candidates = candidates.filter(c => !c.exchange);
  }
  // ------------------------------

  if (candidates.length === 0) {
    throw new Error(`No active investments found for symbol: ${symbol}${data.exchange && data.exchange !== 'null_sentinel' ? ` on ${data.exchange}` : ''}`);
  }

  // 2. Sort by purchase date (Oldest First for FIFO)
  candidates.sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());

  // 3. Execute Atomic Transaction
  await runTransaction(db, async (tx) => {
    // Re-fetch inside transaction to ensure data integrity (Optimistic locking)
    const invReads = await Promise.all(candidates.map(c => tx.get(doc(db, 'users', uid, 'investments', c.id))));
    const freshInvs = invReads.map(fromInvestmentDoc);

    let remainingQtyToSell = data.quantity;
    
    // Check global availability first
    const totalAvailable = freshInvs.reduce((acc, inv) => acc + (inv.purchaseQuantity - (inv.totalSoldQty ?? 0)), 0);
    
    // Allow a tiny epsilon for float math safety
    if (remainingQtyToSell > totalAvailable + 0.00000001) {
        throw new Error(`Insufficient funds. You have ${totalAvailable} available, but tried to sell ${remainingQtyToSell}.`);
    }

    // Distribute the sell quantity across lots
    for (const inv of freshInvs) {
        if (remainingQtyToSell <= 0.00000001) break;

        const currentAvailable = inv.purchaseQuantity - (inv.totalSoldQty ?? 0);
        
        // Skip exhausted ones if status wasn't updated correctly for some reason
        if (currentAvailable <= 0.00000001) continue; 

        // Determine how much to take from this specific lot
        const take = Math.min(currentAvailable, remainingQtyToSell);
        
        // Prepare Transaction Data
        const txTotalAmount = take * data.pricePerUnit;
        
        // Create new Tx Doc Ref within the subcollection of this specific lot
        const newTxRef = doc(txCol(uid, inv.id));

        // Calculate aggregates (Reusing logic from addTransaction)
        const totalSoldQty = (inv.totalSoldQty ?? 0) + take;
        const availableQty = Math.max(0, inv.purchaseQuantity - totalSoldQty);
        
        // Determine Status
        const status: Investment['status'] =
          inv.type === 'Interest Account' ? 'Active' : (availableQty > 1e-6 ? 'Active' : 'Sold');
        
        const realizedProceeds = (inv.realizedProceeds ?? 0) + txTotalAmount;
        const realizedPnL = (inv.realizedPnL ?? 0) + ((data.pricePerUnit - inv.purchasePricePerUnit) * take);

        // Update Investment Document
        tx.update(doc(db, 'users', uid, 'investments', inv.id), {
            totalSoldQty,
            realizedProceeds,
            realizedPnL,
            status,
            updatedAt: serverTimestamp()
        });

        // Create Transaction Document
        tx.set(newTxRef, {
            type: 'Sell',
            date: toTS(data.date),
            quantity: take,
            pricePerUnit: data.pricePerUnit,
            totalAmount: txTotalAmount
        });

        remainingQtyToSell -= take;
    }
  });
}
