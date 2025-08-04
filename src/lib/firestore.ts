import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, Timestamp, type PartialWithFieldValue } from 'firebase/firestore';
import { db } from './firebase';
import type { Investment, InvestmentFormValues } from './types';

const getInvestmentsCollection = (userId: string) => {
    return collection(db, 'users', userId, 'investments');
}

// Convert Firestore Timestamps to ISO strings
const fromFirestore = (doc: any): Investment => {
    const data = doc.data();
    return {
        id: doc.id,
        ...data,
        purchaseDate: (data.purchaseDate as Timestamp).toDate().toISOString(),
    }
}

// Convert form values (with JS Date) to Firestore-compatible data (with Timestamp)
const toFirestore = (data: Partial<InvestmentFormValues>) => {
    const firestoreData: any = { ...data };
    if (data.purchaseDate && data.purchaseDate instanceof Date) {
        firestoreData.purchaseDate = Timestamp.fromDate(data.purchaseDate);
    }
    return firestoreData;
}


export const getInvestments = async (userId: string): Promise<Investment[]> => {
    const querySnapshot = await getDocs(getInvestmentsCollection(userId));
    return querySnapshot.docs.map(fromFirestore);
}

export const addInvestment = async (userId: string, data: InvestmentFormValues): Promise<void> => {
    await addDoc(getInvestmentsCollection(userId), toFirestore(data));
}

export const updateInvestment = async (userId: string, investmentId: string, data: Partial<InvestmentFormValues>): Promise<void> => {
    const docRef = doc(db, 'users', userId, 'investments', investmentId);
    await updateDoc(docRef, toFirestore(data));
}

export const deleteInvestment = async (userId: string, investmentId: string): Promise<void> => {
    const docRef = doc(db, 'users', userId, 'investments', investmentId);
    await deleteDoc(docRef);
}
