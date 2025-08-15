// src/lib/firebase-admin.ts
import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(), // or cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!))
  });
}
export const adminDb = getFirestore();
