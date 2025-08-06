

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
    // Remove the status field if it exists, as it's a computed property
    delete firestoreData.status;
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
    const investmentRef = doc(db, 'users', userId, 'investments', investmentId);
    const newTransactionRef = doc(collection(db, 'users', userId, 'investments', investmentId, 'transactions'));
    const transactionsCollection = getTransactionsCollection(userId, investmentId);

    const batch = writeBatch(db);

    // 1. Add the new transaction document to the batch
    batch.set(newTransactionRef, toFirestore({
        ...transactionData,
        totalAmount: transactionData.quantity * transactionData.pricePerUnit
    }));

    // 2. Fetch all transactions (including the new one in memory) and recalculate aggregates
    const currentTransactionsSnapshot = await getDocsFromServer(transactionsCollection);
    
    // Manually add the new transaction to our in-memory list for calculation
    const allTransactionsData: (Transaction | TransactionFormValues)[] = [
        ...currentTransactionsSnapshot.docs.map(transactionFromFirestore),
        { 
            ...transactionData,
            // Convert date to string for consistent type handling during calculation
            date: transactionData.date.toISOString() 
        }
    ];

    const buys = allTransactionsData.filter(t => t.type === 'Buy');
    const sells = allTransactionsData.filter(t => t.type === 'Sell');

    const totalBuyQty = buys.reduce((sum, t) => sum + t.quantity, 0);
    const totalSellQty = sells.reduce((sum, t) => sum + t.quantity, 0);
    const totalBuyCost = buys.reduce((sum, t) => sum + t.pricePerUnit * t.quantity, 0);

    const totalQuantity = totalBuyQty - totalSellQty;
    const averageBuyPrice = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
    
    // Determine status based on remaining quantity, using a small epsilon for floating point issues
    const status: Investment['status'] = totalQuantity > 0.000001 ? 'Active' : 'Sold';

    // 3. Add the update operation for the parent investment document to the batch
    batch.update(investmentRef, {
        totalQuantity,
        averageBuyPrice,
        totalCost: totalBuyCost,
        status, // Status is now calculated and set here
    });

    // 4. Commit the entire batch
    await batch.commit();
};
