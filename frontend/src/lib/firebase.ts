import { initializeApp, getApps, getApp } from "firebase/app";
import { Auth, getAuth, GoogleAuthProvider } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import { Analytics, getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAYIuIphaTzqV56gwbWOHYShf5p-cyxYCk",
  authDomain: "unidoc-493609.firebaseapp.com",
  projectId: "unidoc-493609",
  storageBucket: "unidoc-493609.firebasestorage.app",
  messagingSenderId: "894636866610",
  appId: "1:894636866610:web:ed5fcd475112f9e037502b",
  measurementId: "G-JVY94D582R"
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
  provider = new GoogleAuthProvider();
  db = getFirestore(app);
  if (typeof window !== "undefined") {
    analytics = getAnalytics(app);
  }
}

export { auth, provider, db, analytics };
