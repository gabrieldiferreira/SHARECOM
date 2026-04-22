import * as admin from 'firebase-admin';

export function initAdmin() {
  if (!admin.apps.length) {
    // Check if Firebase Admin credentials are available
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      console.warn('Firebase Admin credentials not configured. Some features will be limited.');
      return false;
    }

    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
      return true;
    } catch (error) {
      console.error('Failed to initialize Firebase Admin:', error);
      return false;
    }
  }
  return true;
}
