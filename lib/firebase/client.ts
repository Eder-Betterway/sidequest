"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { firebaseConfig, USE_EMULATORS } from "./config";

interface Firebase {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let instance: Firebase | null | undefined;

/**
 * The app's one Firebase connection, or null when it isn't configured yet
 * (a fresh clone with no .env.local). Browser only.
 *
 * Firestore keeps a copy of everything on the phone (IndexedDB), so the plan
 * reads with no signal and changes made offline queue up and sync later.
 */
export function getFirebase(): Firebase | null {
  if (instance !== undefined) return instance;
  const config = firebaseConfig();
  if (!config || typeof window === "undefined") return (instance = null);

  const app = getApps()[0] ?? initializeApp(config);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  if (USE_EMULATORS) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }

  // Ask the browser not to clear our offline copy when space runs low.
  navigator.storage?.persist?.().catch(() => {});

  return (instance = { app, auth, db });
}
