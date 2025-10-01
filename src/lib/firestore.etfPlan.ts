
import { db } from './firebase';
import { collection, doc, writeBatch, getDocs, getDoc, addDoc, deleteDoc, serverTimestamp, query, Timestamp } from 'firebase/firestore';
import type { ETFPlan, ETFComponent, ContributionStep } from './types.etf';
import { format, parseISO, startOfMonth } from 'date-fns';

const plansCol = (uid: string) => collection(db, 'users', uid, 'etfPlans');
const planDoc = (uid: string, planId: string) => doc(db, 'users', uid, 'etfPlans', planId);
const componentsCol = (uid: string, planId: string) => collection(db, 'users', uid, 'etfPlans', planId, 'components');
const componentDoc = (uid: string, planId: string, compId: string) => doc(db, 'users', uid, 'etfPlans', planId, 'components', compId);

function fromPlanDoc(snap: any): ETFPlan {
    const data = snap.data();
    
    return {
        id: snap.id,
        ...data,
        startDate: data.startDate,
        startMonth: data.startMonth,
    } as ETFPlan;
}

function fromComponentDoc(snap: any): ETFComponent {
    return {
        id: snap.id,
        ...snap.data()
    } as ETFComponent;
}

const omitUndefinedDeep = (obj: any): any => {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(omitUndefinedDeep);

    const newObj: { [key: string]: any } = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            if (value !== undefined) {
                newObj[key] = omitUndefinedDeep(value);
            }
        }
    }
    return newObj;
};

export async function getEtfPlans(uid: string): Promise<ETFPlan[]> {
    const snapshot = await getDocs(query(plansCol(uid)));
    return snapshot.docs.map(fromPlanDoc);
}

export async function getEtfPlan(uid: string, planId: string): Promise<(ETFPlan & { components: ETFComponent[] }) | null> {
    const planSnap = await getDoc(planDoc(uid, planId));
    if (!planSnap.exists()) return null;

    const compsSnap = await getDocs(query(componentsCol(uid, planId)));
    const components = compsSnap.docs.map(fromComponentDoc);

    return {
        ...fromPlanDoc(planSnap),
        components
    };
}

export async function createEtfPlan(uid: string, planData: Omit<ETFPlan, 'id'|'createdAt'|'updatedAt'>, components: Omit<ETFComponent, 'id'>[]): Promise<string> {
    const planRef = doc(plansCol(uid));
    
    const batch = writeBatch(db);

    const cleanPlanData = omitUndefinedDeep(planData);

    batch.set(planRef, {
        ...cleanPlanData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    components.forEach(comp => {
        const compRef = doc(componentsCol(uid, planRef.id));
        batch.set(compRef, comp);
    });

    await batch.commit();
    return planRef.id;
}


export async function updateEtfPlan(uid: string, planId: string, planData: Partial<Omit<ETFPlan, 'id'>>, components: Omit<ETFComponent, 'id'>[]) {
    const batch = writeBatch(db);

    const planRef = planDoc(uid, planId);
    
    const cleanPlanData = omitUndefinedDeep(planData);

    const payload: Record<string, any> = { ...cleanPlanData, updatedAt: serverTimestamp() };

    batch.update(planRef, payload);

    const existingComps = await getDocs(query(componentsCol(uid, planId)));
    existingComps.forEach(doc => batch.delete(doc.ref));

    components.forEach(comp => {
        const compRef = doc(componentsCol(uid, planId));
        batch.set(compRef, comp);
    });

    await batch.commit();
}


export async function deleteEtfPlan(uid: string, planId: string) {
    const batch = writeBatch(db);
    
    const compsSnap = await getDocs(query(componentsCol(uid, planId)));
    compsSnap.forEach(docu => batch.delete(docu.ref));

    const latestSummaryRef = doc(db, 'users', uid, 'etfPlans', planId, 'latest_sim_summary', 'latest');
    batch.delete(latestSummaryRef);

    batch.delete(planDoc(uid, planId));
    
    await batch.commit();
}
