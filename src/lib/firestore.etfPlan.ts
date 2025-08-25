

import { db } from './firebase';
import { collection, doc, writeBatch, getDocs, getDoc, addDoc, deleteDoc, serverTimestamp, query, Timestamp } from 'firebase/firestore';
import type { ETFPlan, ETFComponent, ContributionStep } from './types.etf';
import { format, parseISO, startOfMonth } from 'date-fns';

const plansCol = (uid: string) => collection(db, 'users', uid, 'etfPlans');
const planDoc = (uid: string, planId: string) => doc(db, 'users', uid, 'etfPlans', planId);
const componentsCol = (uid: string, planId: string) => collection(db, 'users', uid, 'etfPlans', planId, 'components');
const componentDoc = (uid: string, planId: string, compId: string) => doc(db, 'users', uid, 'etfPlans', planId, 'components', compId);

function normalizeStart(raw: any): { startDate: string; startMonth: string } {
  // raw can be a string 'YYYY-MM-dd', a Timestamp, or something legacy.
  if (typeof raw === 'string') {
    // Expecting 'YYYY-MM-dd' already; ensure month string too.
    const startMonth = raw.slice(0, 7);
    return { startDate: raw, startMonth };
  }
  if (raw && typeof raw.toDate === 'function') {
    // Firestore Timestamp → normalize to local-agnostic month/day strings
    const d: Date = (raw as Timestamp).toDate();
    const start = startOfMonth(d);
    return {
      startDate: format(start, 'yyyy-MM-dd'),
      startMonth: format(start, 'yyyy-MM'),
    };
  }
  // Fallback: try Date constructor
  const d = new Date(raw);
  const start = startOfMonth(isNaN(d.getTime()) ? new Date() : d);
  return {
    startDate: format(start, 'yyyy-MM-dd'),
    startMonth: format(start, 'yyyy-MM'),
  };
}

function fromPlanDoc(snap: any): ETFPlan {
    const data = snap.data();
    const norm = normalizeStart(data.startDate);

    // Prefer stored startMonth if valid; otherwise use normalized
    const storedStartMonth: string | undefined =
        typeof data.startMonth === 'string' && /^\d{4}-\d{2}$/.test(data.startMonth)
        ? data.startMonth
        : undefined;

    return {
        id: snap.id,
        ...data,
        startDate: norm.startDate,
        startMonth: storedStartMonth ?? norm.startMonth,
    } as ETFPlan;
}

function fromComponentDoc(snap: any): ETFComponent {
    return {
        id: snap.id,
        ...snap.data()
    } as ETFComponent;
}

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

    const startDateObj = new Date(planData.startDate);
    const startMonth = format(startOfMonth(startDateObj), 'yyyy-MM');

    batch.set(planRef, {
        ...planData,
        startDate: format(startDateObj, 'yyyy-MM-dd'),
        startMonth: startMonth,
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
    const payload: Record<string, any> = { ...planData, updatedAt: serverTimestamp() };
    if (planData.startDate) {
        const startDateObj = new Date(planData.startDate);
        payload.startDate = format(startDateObj, 'yyyy-MM-dd');
        payload.startMonth = format(startOfMonth(startDateObj), 'yyyy-MM');
    }
    batch.update(planRef, payload);

    // Easiest way to sync components is to delete existing and create new ones.
    const existingComps = await getDocs(query(componentsCol(uid, planId)));
    existingComps.forEach(doc => batch.delete(doc.ref));

    components.forEach(comp => {
        // When updating, we create new component docs. Their IDs will be auto-generated.
        const compRef = doc(componentsCol(uid, planId));
        batch.set(compRef, comp);
    });

    await batch.commit();
}


export async function deleteEtfPlan(uid: string, planId: string) {
    const batch = writeBatch(db);
    
    // Delete components subcollection
    const compsSnap = await getDocs(query(componentsCol(uid, planId)));
    compsSnap.forEach(doc => batch.delete(doc.ref));

    // Delete plan document
    batch.delete(planDoc(uid, planId));
    
    // TODO: Consider deleting price data as well, or leave it for potential reuse.
    // For now, we leave it to avoid long-running operations.

    await batch.commit();
}
