
import { collection, addDoc, getDocsFromServer, doc, updateDoc, deleteDoc, Timestamp, writeBatch, getDoc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import type { Investment, OldInvestmentFormValues, Transaction, TransactionFormValues } from './types';

// === Collections ===
const getInvestmentsCollection = (userId: string) => {
    return collection(db, 'users', userId, 'investments');
}

const getTransactionsCollection = (userId: string, investmentId: string) => {
    return collection(db, 'users', userId, 'investments', investmentId, 'transactions');
}

// === Converters ===
const investmentFromFirestore = (doc: any): Investment => {
    const data = doc.data();
    return {
        id: doc.id,
        ...data,
        // Ensure date fields are converted to ISO strings for consistency
        purchaseDate: data.purchaseDate instanceof Timestamp ? data.purchaseDate.toDate().toISOString() : data.purchaseDate,
    } as Investment;
}

const transactionFromFirestore = (doc: any): Transaction => {
    const data = doc.data();
    return {
        id: doc.id,
        ...data,
        date: (data.date as Timestamp).toDate().toISOString(),
    }
}

// Convert form values (with JS Date) to Firestore-compatible data (with Timestamp)
const toFirestore = (data: any) => {
    const firestoreData: any = { ...data };
    // Check for date fields that need conversion
    if (data.purchaseDate && data.purchaseDate instanceof Date) {
        firestoreData.purchaseDate = Timestamp.fromDate(data.purchaseDate);
    }
    if (data.date && data.date instanceof Date) {
        firestoreData.date = Timestamp.fromDate(data.date);
    }
    return firestoreData;
}

// === Investment Functions ===
export const getInvestments = async (userId: string): Promise<Investment[]> => {
    const querySnapshot = await getDocsFromServer(getInvestmentsCollection(userId));
    // TODO: In the future, this should also fetch transaction summaries or this logic should move to the backend
    return querySnapshot.docs.map(investmentFromFirestore);
}

// This function is now deprecated and will be replaced by a transaction-based creation
export const addInvestment = async (userId: string, data: OldInvestmentFormValues): Promise<void> => {
    await addDoc(getInvestmentsCollection(userId), toFirestore(data));
}

// This function will be updated to handle aggregated data
export const updateInvestment = async (userId: string, investmentId: string, data: Partial<OldInvestmentFormValues>): Promise<void> => {
    const docRef = doc(db, 'users', userId, 'investments', investmentId);
    await updateDoc(docRef, toFirestore(data));
}

// Deleting an investment should also delete its transactions sub-collection
export const deleteInvestment = async (userId: string, investmentId: string): Promise<void> => {
    const investmentRef = doc(db, 'users', userId, 'investments', investmentId);
    const transactionsSnapshot = await getDocsFromServer(getTransactionsCollection(userId, investmentId));
    
    const batch = writeBatch(db);
    
    // Delete all transactions within the sub-collection
    transactionsSnapshot.forEach(doc => {
        batch.delete(doc.ref);
    });
    
    // Delete the parent investment document
    batch.delete(investmentRef);
    
    await batch.commit();
}


// === Transaction Functions ===

export const getTransactions = async (userId: string, investmentId: string): Promise<Transaction[]> => {
    const querySnapshot = await getDocsFromServer(getTransactionsCollection(userId, investmentId));
    return querySnapshot.docs.map(transactionFromFirestore).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export const addTransaction = async (userId: string, investmentId: string, transactionData: TransactionFormValues): Promise<void> => {
    await runTransaction(db, async (tx) => {
        const investmentRef = doc(db, 'users', userId, 'investments', investmentId);
        const newTransactionRef = doc(getTransactionsCollection(userId, investmentId));

        // 1. Add the new transaction
        tx.set(newTransactionRef, toFirestore({
            ...transactionData,
            totalAmount: transactionData.quantity * transactionData.pricePerUnit
        }));

        // 2. Aggregate the data and update the parent investment document
        // In a real-world app, this would be better handled by a Cloud Function for reliability.
        // For this client-side implementation, we'll re-fetch all transactions and recalculate.
        const currentTransactionsSnapshot = await getDocsFromServer(getTransactionsCollection(userId, investmentId));
        const allTransactions = [...currentTransactionsSnapshot.docs.map(transactionFromFirestore), {
            id: newTransactionRef.id,
            ...transactionData,
            date: transactionData.date.toISOString(),
            totalAmount: transactionData.quantity * transactionData.pricePerUnit
        }];
        
        const buys = allTransactions.filter(t => t.type === 'Buy');
        const sells = allTransactions.filter(t => t.type === 'Sell');

        const totalBuyQty = buys.reduce((sum, t) => sum + t.quantity, 0);
        const totalSellQty = sells.reduce((sum, t) => sum + t.quantity, 0);
        const totalBuyCost = buys.reduce((sum, t) => sum + t.totalAmount, 0);

        const totalQuantity = totalBuyQty - totalSellQty;
        const averageBuyPrice = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
        const status: Investment['status'] = totalQuantity > 0.000001 ? 'Active' : 'Sold';

        tx.update(investmentRef, {
            totalQuantity,
            averageBuyPrice,
            totalCost: totalBuyCost,
            status,
        });
    });
};
