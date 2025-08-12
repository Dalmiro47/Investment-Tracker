import { collection, addDoc, getDocsFromServer, doc, updateDoc, deleteDoc, Timestamp, writeBatch, runTransaction, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { Investment, Transaction, TransactionFormValues, InvestmentFormValues } from './types';

const investmentsCol = (uid: string) => collection(db, 'users', uid, 'investments');
const txCol = (uid: string, invId: string) => collection(db, 'users', uid, 'investments', invId, 'transactions');

const toTS = (d: Date) => Timestamp.fromDate(d);

const fromInvestmentDoc = (snap: any): Investment => {
  const d = snap.data();
  return {
    id: snap.id,
    ...d,
    purchaseDate: (d.purchaseDate?.toDate?.() ?? new Date(d.purchaseDate)).toISOString(),
  } as Investment;
};

const fromTxDoc = (snap: any): Transaction => {
  const d = snap.data();
  return {
    id: snap.id,
    ...d,
    date: (d.date as Timestamp).toDate().toISOString(),
  } as Transaction;
};

export async function getInvestments(uid: string): Promise<Investment[]> {
  const q = await getDocsFromServer(investmentsCol(uid));
  return q.docs.map(fromInvestmentDoc);
}

export async function addInvestment(uid: string, data: InvestmentFormValues) {
  await addDoc(investmentsCol(uid), {
    ...data,
    purchaseDate: toTS(data.purchaseDate),
    currentValue: data.purchasePricePerUnit, // Start with the purchase price
    totalSoldQty: 0,
    realizedProceeds: 0,
    realizedPnL: 0,
    dividends: 0,
    interest: 0,
    status: 'Active',
    createdAt: serverTimestamp(),
  });
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
  const batch = writeBatch(db);
  txSnap.forEach(d => batch.delete(d.ref));
  batch.delete(invRef);
  await batch.commit();
}

export async function getTransactions(uid: string, invId: string): Promise<Transaction[]> {
  const q = await getDocsFromServer(txCol(uid, invId));
  return q.docs.map(fromTxDoc).sort((a,b) => +new Date(b.date) - +new Date(a.date));
}

const reaggregateAndBatchUpdate = (
    batch: any,
    investmentRef: any,
    investment: Investment,
    transactions: Transaction[]
) => {
    const sells = transactions.filter(t => t.type === 'Sell');
    const divs = transactions.filter(t => t.type === 'Dividend');
    const ints = transactions.filter(t => t.type === 'Interest');

    const totalSoldQty = sells.reduce((s, x) => s + x.quantity, 0);
    const realizedProceeds = sells.reduce((s, x) => s + x.totalAmount, 0);
    const realizedPnL = sells.reduce((s, x) => s + (x.pricePerUnit - investment.purchasePricePerUnit) * x.quantity, 0);

    const dividends = divs.reduce((s, x) => s + x.totalAmount, 0);
    const interest = ints.reduce((s, x) => s + x.totalAmount, 0);

    const availableQty = Math.max(0, investment.purchaseQuantity - totalSoldQty);
    const status: Investment['status'] = availableQty > 0.000001 ? 'Active' : 'Sold';

    const updateData = {
        totalSoldQty,
        realizedProceeds,
        realizedPnL,
        dividends,
        interest,
        status,
        updatedAt: serverTimestamp(),
    };
    batch.update(investmentRef, updateData);
};


export async function addTransaction(uid: string, invId: string, t: TransactionFormValues) {
    const invRef = doc(db, 'users', uid, 'investments', invId);
    
    await runTransaction(db, async (transaction) => {
        const invSnap = await transaction.get(invRef);
        if (!invSnap.exists()) throw new Error("Investment not found!");
        const investment = fromInvestmentDoc(invSnap);

        const existingTxSnap = await getDocsFromServer(txCol(uid, invId));
        const allTransactions = existingTxSnap.docs.map(fromTxDoc);

        const isSell = t.type === 'Sell';
        const totalAmount = isSell ? t.quantity * t.pricePerUnit : t.amount;
        
        const newTransactionData: Omit<Transaction, 'id'> = {
            type: t.type,
            date: t.date.toISOString(),
            quantity: isSell ? t.quantity : 0,
            pricePerUnit: isSell ? t.pricePerUnit : 0,
            totalAmount,
        };
        allTransactions.push({ ...newTransactionData, id: 'new' }); // temp id

        const newTxRef = doc(txCol(uid, invId));
        transaction.set(newTxRef, toTS(newTransactionData));
        
        const batch = writeBatch(db); // Create a write batch for updates
        reaggregateAndBatchUpdate(batch, invRef, investment, allTransactions);
        await batch.commit(); // This commit is happening outside the transaction, which is not ideal.
    });

    // A better approach is to do the reaggregation within the transaction itself
    // Let's refactor to do that.
    await runTransaction(db, async (tx) => {
        const invRef = doc(db, 'users', uid, 'investments', invId);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) throw new Error('Investment not found');
        const inv = fromInvestmentDoc(invSnap);

        // Get existing transactions within the transaction
        const txSnap = await getDocsFromServer(txCol(uid, invId));
        const allTxs = txSnap.docs.map(fromTxDoc);

        // Add the new transaction
        const isSell = t.type === 'Sell';
        const totalAmount = isSell ? t.quantity * t.pricePerUnit : t.amount;
        const newTxData = {
          type: t.type,
          date: t.date,
          quantity: isSell ? t.quantity : 0,
          pricePerUnit: isSell ? t.pricePerUnit : 0,
          totalAmount,
        };
        const newFullTx: Transaction = { ...newTxData, id: 'temp', date: t.date.toISOString() };
        allTxs.push(newFullTx);
        
        // Add transaction document
        const newTxRef = doc(txCol(uid, invId));
        tx.set(newTxRef, { ...newTxData, date: toTS(t.date) });
        
        // Re-aggregate based on ALL transactions (including the new one)
        const sells = allTxs.filter(x => x.type === 'Sell');
        const divs  = allTxs.filter(x => x.type === 'Dividend');
        const ints  = allTxs.filter(x => x.type === 'Interest');

        const totalSoldQty = sells.reduce((s, x) => s + x.quantity, 0);
        const realizedProceeds = sells.reduce((s, x) => s + x.totalAmount, 0);
        const realizedPnL = sells.reduce((s, x) => s + (x.pricePerUnit - inv.purchasePricePerUnit) * x.quantity, 0);
        const dividends = divs.reduce((s, x) => s + x.totalAmount, 0);
        const interest  = ints.reduce((s, x) => s + x.totalAmount, 0);
        const avail = Math.max(inv.purchaseQuantity - totalSoldQty, 0);
        const status = avail > 0.000001 ? 'Active' : 'Sold';

        tx.update(invRef, { totalSoldQty, realizedProceeds, realizedPnL, dividends, interest, status, updatedAt: serverTimestamp() });
    });
}
