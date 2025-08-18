// server-only: src/lib/firebase-admin.ts
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const adminDb = (() => {
  if (getApps().length === 0) {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL } = process.env;
    let { FIREBASE_PRIVATE_KEY } = process.env as Record<string, string | undefined>;

    if (!FIREBASE_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID missing from environment variables');
    if (!FIREBASE_CLIENT_EMAIL) throw new Error('FIREBASE_CLIENT_EMAIL missing from environment variables');
    if (!FIREBASE_PRIVATE_KEY) throw new Error('FIREBASE_PRIVATE_KEY missing from environment variables');

    // handle escaped newlines; harmless if real newlines are already present
    FIREBASE_PRIVATE_KEY = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    initializeApp({
      credential: cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY,
      }),
    });
  }
  return getFirestore();
})();
