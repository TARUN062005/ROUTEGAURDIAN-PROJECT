// client/src/lib/push/firebaseClient.js

import { initializeApp, getApps } from "firebase/app";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app = null;

const isFirebaseConfigured = () =>
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId;

if (isFirebaseConfigured()) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  } catch (err) {
    console.warn("Firebase initialization skipped:", err.message);
  }
} else {
  console.info("Firebase not configured");
}

export { app };
export const messaging = null;
