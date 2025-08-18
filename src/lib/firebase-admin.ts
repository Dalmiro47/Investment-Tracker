// server-only: src/lib/firebase-admin.ts
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const adminDb = (() => {
  if (getApps().length === 0) {
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL } = process.env;
    let { FIREBASE_PRIVATE_KEY } = process.env as Record<string, string | undefined>;

    if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
      console.log('[admin] Initializing with Service Account credentials');
      FIREBASE_PRIVATE_KEY = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      initializeApp({
        credential: cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY,
        }),
      });
    } else {
      console.log('[admin] Initializing with Application Default Credentials (ADC)');
      initializeApp({
        credential: applicationDefault(),
      });
    }
  }
  return getFirestore();
})();
