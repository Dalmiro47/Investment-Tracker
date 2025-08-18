// server-only: src/lib/firebase-admin.ts
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// This is a self-invoking function to ensure Firestore admin is initialized only once.
export const adminDb = (() => {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    // Private key often comes with literal '\n' which needs to be replaced
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      // This will prevent the app from starting without proper credentials
      // and give a clear error in the server logs.
      console.error("Missing Firebase Admin environment variables. The app will not be able to connect to Firestore on the server.");
      // In a real production scenario, you might want to throw an error
      // throw new Error('Missing Firebase Admin environment variables');
    } else {
        initializeApp({
            credential: cert({ projectId, clientEmail, privateKey }),
        });
    }
  }
  return getFirestore();
})();
