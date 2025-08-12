
import { collection, addDoc, getDocsFromServer, doc, updateDoc, deleteDoc, Timestamp, writeBatch, runTransaction, getDoc, serverTimestamp, query } from 'firebase/firestore';
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
    createdAt: d.createdAt?.toDate?.().toISOString() ?? undefined,
    updatedAt: d.updatedAt?.toDate?.().toISOString() ?? undefined,
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

const reaggregateAndApply = (
    tx: any, // Firebase Transaction object
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
    tx.update(investmentRef, updateData);
};


export async function addTransaction(uid: string, invId: string, t: TransactionFormValues) {
    await runTransaction(db, async (tx) => {
        const invRef = doc(db, 'users', uid, 'investments', invId);
        const txCollectionRef = txCol(uid, invId);

        // --- READS FIRST ---
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists()) throw new Error('Investment not found');
        const investment = fromInvestmentDoc(invSnap);
        
        const existingTxSnap = await tx.get(txCollectionRef);
        const allTransactions = existingTxSnap.docs.map(fromTxDoc);

        // --- THEN WRITES ---
        const newTxRef = doc(txCollectionRef);
        const isSell = t.type === 'Sell';
        const totalAmount = isSell ? t.quantity * t.pricePerUnit : t.amount;

        const newTransactionData: Omit<Transaction, 'id' | 'date'> & { date: Date } = {
            type: t.type,
            date: t.date,
            quantity: isSell ? t.quantity : 0,
            pricePerUnit: isSell ? t.pricePerUnit : 0,
            totalAmount,
        };
        
        // Manually add the newly-created-in-memory transaction to the list for aggregation
        allTransactions.push({ ...newTransactionData, id: newTxRef.id, date: t.date.toISOString() });
        
        // Write 1: Update aggregates on parent investment
        reaggregateAndApply(tx, invRef, investment, allTransactions);
        
        // Write 2: Create the new transaction document
        tx.set(newTxRef, { ...newTransactionData, date: toTS(t.date) });
    });
}
