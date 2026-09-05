import { initializeApp, getApp, getApps, applicationDefault, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let isInitialized = false;

export function initializeFirebaseAdmin(): App {
  if (isInitialized || getApps().length > 0) {
    return getApp();
  }

  // Use Application Default Credentials (ADC) for Google Cloud Run
  try {
    const app = initializeApp({
      credential: applicationDefault(),
    });
    isInitialized = true;
    return app;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to initialize Firebase Admin with Application Default Credentials. ` +
      `Ensure ADC is available or GOOGLE_APPLICATION_CREDENTIALS is set in the environment. Details: ${message}`
    );
  }
}

/**
 * Returns a Firestore instance for server-side repositories.
 * Initializes Firebase Admin if not already initialized.
 */
export function getFirestoreInstance(): Firestore {
  const app = initializeFirebaseAdmin();
  return getFirestore(app);
}
