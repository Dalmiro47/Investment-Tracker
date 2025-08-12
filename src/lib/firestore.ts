

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
    const transactionsCollectionRef = getTransactionsCollection(userId, investmentId);
    
    await runTransaction(db, async (transaction) => {
        const investmentDoc = await transaction.get(investmentRef);
        if (!investmentDoc.exists()) {
            throw new Error("Investment document does not exist!");
        }

        const existingTransactionsSnapshot = await getDocs(getTransactionsCollection(userId, investmentId));
        const existingTransactions = existingTransactionsSnapshot.docs.map(transactionFromFirestore);
        
        const newTransactionData = {
            ...transactionData,
            totalAmount: transactionData.quantity * transactionData.pricePerUnit
        };

        const allTransactions = [...existingTransactions, { id: 'new', ...newTransactionData, date: newTransactionData.date.toISOString() }];
        
        const buys = allTransactions.filter(t => t.type === 'Buy');
        if (buys.length === 0) {
             const investmentData = investmentDoc.data();
             buys.push({
                 id: 'synthetic-initial-buy',
                 type: 'Buy',
                 date: investmentData.purchaseDate instanceof Timestamp ? investmentData.purchaseDate.toDate().toISOString() : investmentData.purchaseDate,
                 quantity: investmentData.quantity,
                 pricePerUnit: investmentData.initialValue,
                 totalAmount: investmentData.initialValue * investmentData.quantity
             });
        }
        
        const sells = allTransactions.filter(t => t.type === 'Sell');

        const totalBuyQty = buys.reduce((sum, t) => sum + t.quantity, 0);
        const totalSellQty = sells.reduce((sum, t) => sum + t.quantity, 0);
        const totalBuyCost = buys.reduce((sum, t) => sum + t.totalAmount, 0);
        const totalSaleValue = sells.reduce((sum, t) => sum + t.totalAmount, 0);
        
        const newQuantity = totalBuyQty - totalSellQty;
        const newStatus: Investment['status'] = newQuantity > 0.000001 ? 'Active' : 'Sold';
        
        const updateData: any = {
            quantity: newQuantity,
            status: newStatus,
            totalCost: totalBuyCost,
            totalSaleValue: totalSaleValue,
        };

        if (newStatus === 'Sold') {
            const lastSell = sells.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            if(lastSell) {
                updateData.currentValue = lastSell.pricePerUnit;
            } else if (transactionData.type === 'Sell') {
                 updateData.currentValue = transactionData.pricePerUnit;
            }
        }
        
        const newTransactionRef = doc(transactionsCollectionRef);
        transaction.set(newTransactionRef, toFirestore(newTransactionData));
        transaction.update(investmentRef, updateData);
    });
};
