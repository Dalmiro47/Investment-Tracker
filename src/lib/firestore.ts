

import { collection, addDoc, getDocsFromServer, doc, updateDoc, deleteDoc, Timestamp, writeBatch, getDoc, runTransaction, getDocs } from 'firebase/firestore';
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
    
    await runTransaction(db, async (transaction) => {
        const investmentDoc = await transaction.get(investmentRef);
        if (!investmentDoc.exists()) {
            throw new Error("Investment document does not exist!");
        }

        // Firestore transactions require us to fetch all documents first.
        // So we get all existing transactions for this investment.
        const existingTransactionsSnapshot = await getDocs(getTransactionsCollection(userId, investmentId));
        const existingTransactions = existingTransactionsSnapshot.docs.map(transactionFromFirestore);
        
        // Prepare the new transaction data
        const newTransactionData = {
            ...transactionData,
            totalAmount: transactionData.quantity * transactionData.pricePerUnit
        };

        const allTransactions: Transaction[] = [...existingTransactions, { id: 'new', ...newTransactionData, date: newTransactionData.date.toISOString() }];
        
        // --- Start Aggregation ---
        const buys  = allTransactions.filter(t => t.type === 'Buy');
        const sells = allTransactions.filter(t => t.type === 'Sell');

        const totalBuyQty = buys.reduce((s,t)=>s+t.quantity,0);
        const totalSellQty = sells.reduce((s,t)=>s+t.quantity,0);
        const totalBuyCost = buys.reduce((s,t)=>s+t.totalAmount,0);
        const totalProceeds = sells.reduce((s,t)=>s+t.totalAmount,0);

        const avgBuyPrice  = totalBuyQty  > 0 ? totalBuyCost / totalBuyQty  : 0;
        const avgSellPrice = totalSellQty > 0 ? totalProceeds / totalSellQty : 0;
        const availableQty = Math.max(0, totalBuyQty - totalSellQty);
        const status: Investment['status'] = availableQty > 0.000001 ? 'Active' : 'Sold';

        // realized P/L using average-cost method
        const realizedPL = totalProceeds - avgBuyPrice * totalSellQty;
        
        const updateData: any = {
          quantity: availableQty, // This is the available quantity
          totalBuyQty,
          totalSellQty,
          totalCost: totalBuyCost,
          totalProceeds,
          averageBuyPrice: avgBuyPrice,
          averageSellPrice: avgSellPrice,
          realizedPL,
          status,
        };

        if (status === 'Sold') {
            const lastSell = sells.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            if(lastSell) {
                updateData.currentValue = lastSell.pricePerUnit;
            } else if (transactionData.type === 'Sell') {
                 updateData.currentValue = transactionData.pricePerUnit;
            }
        }
        
        // Now we can perform the writes
        const newTransactionRef = doc(getTransactionsCollection(userId, investmentId));
        transaction.set(newTransactionRef, toFirestore(newTransactionData));
        transaction.update(investmentRef, updateData);
    });
};
