import { initializeApp, getApps, getApp } from "firebase/app";
import { Auth, getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import {
  Firestore,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { Analytics, getAnalytics } from "firebase/analytics";

const normalizeAuthDomain = (authDomain?: string) => {
  const domain = authDomain?.trim() || "auth.sharecom.com.br";

  if (/^https?:\/\//i.test(domain)) {
    return new URL(domain).host;
  }

  return domain.replace(/\/+$/, "");
};

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAYIuIphaTzqV56gwbWOHYShf5p-cyxYCk",
  authDomain: normalizeAuthDomain(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "unidoc-493609",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "unidoc-493609.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "894636866610",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:894636866610:web:ed5fcd475112f9e037502b",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-JVY94D582R"
};

export const hasFirebaseConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.storageBucket,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId,
].every(Boolean);

let auth: Auth | null = null;
let provider: GoogleAuthProvider | null = null;
let db: Firestore | null = null;
let analytics: Analytics | null = null;

if (hasFirebaseConfig) {
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);

  // Garantir persistência local
  if (typeof window !== "undefined") {
    setPersistence(auth, browserLocalPersistence);
  }

  provider = new GoogleAuthProvider();
  if (typeof window !== "undefined") {
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch (error) {
      console.log('Offline mode already initialized', error);
      db = getFirestore(app);
    }
    analytics = getAnalytics(app);
  } else {
    db = getFirestore(app);
  }
}

export { auth, provider, db, analytics };
