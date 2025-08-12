

import { collection, addDoc, getDocsFromServer, doc, updateDoc, deleteDoc, Timestamp, writeBatch, getDoc, runTransaction, getDocs, serverTimestamp } from 'firebase/firestore';
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
        date: data.date instanceof Timestamp ? data.date.toDate().toISOString() : data.date,
    }
}

// Convert form values (with JS Date) to Firestore-compatible data (with Timestamp)
const toFirestore = (data: any) => {
    const firestoreData: any = { ...data };
    if (data.purchaseDate && data.purchaseDate instanceof Date) {
        firestoreData.purchaseDate = Timestamp.fromDate(data.purchaseDate);
    }
    if (data.date && data.date instanceof Date) {
        firestoreData.date = Timestamp.fromDate(data.date);
    }
    return firestoreData;
}


const reaggregateAndBatchUpdate = (
    batch: any,
    investmentRef: any,
    transactions: Omit<Transaction, 'id'>[]
) => {
    const buys = transactions.filter(t => t.type === 'Buy');
    const sells = transactions.filter(t => t.type === 'Sell');

    const totalBuyQty = buys.reduce((s, t) => s + t.quantity, 0);
    const totalSellQty = sells.reduce((s, t) => s + t.quantity, 0);
    const totalCost = buys.reduce((s, t) => s + t.totalAmount, 0);
    const totalProceeds = sells.reduce((s, t) => s + t.totalAmount, 0);

    const avgBuyPrice = totalBuyQty > 0 ? totalCost / totalBuyQty : 0;
    const avgSellPrice = totalSellQty > 0 ? totalProceeds / totalSellQty : 0;
    const availableQty = Math.max(0, totalBuyQty - totalSellQty);
    const status: Investment['status'] = availableQty > 0.000001 ? 'Active' : 'Sold';

    const realizedPL = totalProceeds - avgBuyPrice * totalSellQty;
    
    const updateData: any = {
      quantity: availableQty,
      totalBuyQty,
      totalSellQty,
      totalCost,
      totalProceeds,
      averageBuyPrice: avgBuyPrice,
      averageSellPrice: avgSellPrice,
      realizedPL,
      status,
      updatedAt: serverTimestamp(),
    };
    
    batch.update(investmentRef, updateData);
}


// === Investment Functions ===
export const getInvestments = async (userId: string): Promise<Investment[]> => {
    const querySnapshot = await getDocsFromServer(getInvestmentsCollection(userId));
    return querySnapshot.docs.map(investmentFromFirestore);
}

// This function is now deprecated and will be replaced by a transaction-based creation
export const addInvestment = async (userId: string, data: OldInvestmentFormValues): Promise<void> => {
    const investmentData = toFirestore(data);
    const newDocRef = doc(getInvestmentsCollection(userId)); // Create a new document reference to get the ID

    const batch = writeBatch(db);

    // Create the initial "Buy" transaction
    const initialBuyTransaction: Omit<Transaction, 'id'> = {
        type: 'Buy',
        date: investmentData.purchaseDate.toDate().toISOString(),
        quantity: investmentData.quantity,
        pricePerUnit: investmentData.initialValue,
        totalAmount: investmentData.quantity * investmentData.initialValue,
    };
    
    const transactionRef = doc(getTransactionsCollection(userId, newDocRef.id));
    batch.set(transactionRef, toFirestore(initialBuyTransaction));

    // Set the main investment document with initial aggregated data
    const aggregatedData = {
        ...investmentData,
        totalBuyQty: investmentData.quantity,
        totalSellQty: 0,
        averageBuyPrice: investmentData.initialValue,
        averageSellPrice: 0,
        totalCost: initialBuyTransaction.totalAmount,
        totalProceeds: 0,
        realizedPL: 0,
        status: 'Active',
    };
    batch.set(newDocRef, aggregatedData);
    
    await batch.commit();
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
    const investmentRef = doc(db, 'users', userId, 'investments', investmentId);
    
    const existingTransactionsSnapshot = await getDocsFromServer(getTransactionsCollection(userId, investmentId));
    const existingTransactions = existingTransactionsSnapshot.docs.map(transactionFromFirestore);
    
    const newTransactionData = {
        ...transactionData,
        totalAmount: transactionData.quantity * transactionData.pricePerUnit
    };

    const allTransactions = [...existingTransactions, newTransactionData];

    const batch = writeBatch(db);
    
    const newTransactionRef = doc(getTransactionsCollection(userId, investmentId));
    batch.set(newTransactionRef, toFirestore(newTransactionData));

    reaggregateAndBatchUpdate(batch, investmentRef, allTransactions);

    await batch.commit();
};

export const updateTransaction = async (userId: string, investmentId: string, transactionId: string, transactionData: TransactionFormValues) => {
    const investmentRef = doc(db, 'users', userId, 'investments', investmentId);
    const transactionRef = doc(db, 'users', userId, 'investments', investmentId, 'transactions', transactionId);

    const existingTransactionsSnapshot = await getDocsFromServer(getTransactionsCollection(userId, investmentId));

    const updatedTransactions = existingTransactionsSnapshot.docs.map(doc => {
        if(doc.id === transactionId) {
            return {
                ...transactionData,
                totalAmount: transactionData.quantity * transactionData.pricePerUnit
            }
        }
        return transactionFromFirestore(doc);
    });
    
    const updatedTransactionData = {
        ...transactionData,
        totalAmount: transactionData.quantity * transactionData.pricePerUnit
    };

    const batch = writeBatch(db);
    batch.update(transactionRef, toFirestore(updatedTransactionData));
    reaggregateAndBatchUpdate(batch, investmentRef, updatedTransactions);
    await batch.commit();
}

export const deleteTransaction = async (userId: string, investmentId: string, transactionId: string) => {
    if (transactionId === 'synthetic-initial-buy') {
        throw new Error("Cannot delete the initial buy transaction. Please edit the investment details instead.");
    }
    const investmentRef = doc(db, 'users', userId, 'investments', investmentId);
    const transactionRef = doc(db, 'users', userId, 'investments', investmentId, 'transactions', transactionId);

    const existingTransactionsSnapshot = await getDocsFromServer(getTransactionsCollection(userId, investmentId));
    const remainingTransactions = existingTransactionsSnapshot.docs
        .filter(doc => doc.id !== transactionId)
        .map(transactionFromFirestore);
    
    const batch = writeBatch(db);

    // Check if any "Buy" transactions remain. If not, the investment becomes invalid.
    const hasRemainingBuy = remainingTransactions.some(t => t.type === 'Buy');
    
    if (!hasRemainingBuy) {
        // If deleting this transaction removes the last 'Buy', delete the entire investment.
        // This prevents orphaned investments.
        remainingTransactions.forEach(tx => {
             const txRef = doc(db, 'users', userId, 'investments', investmentId, 'transactions', tx.id);
             batch.delete(txRef);
        });
        batch.delete(transactionRef);
        batch.delete(investmentRef);
    } else {
        // Otherwise, just delete the one transaction and re-aggregate.
        batch.delete(transactionRef);
        reaggregateAndBatchUpdate(batch, investmentRef, remainingTransactions);
    }
    
    await batch.commit();
}
