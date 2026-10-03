import type { FirebaseOptions } from "firebase/app";

/**
 * Firebase web config. These values are public by design (security rules do
 * the protecting), and each `process.env.NEXT_PUBLIC_*` must be written out in
 * full so Next.js can inline it into the browser bundle.
 */

/** Local test servers instead of real Firebase (tests and offline dev). */
export const USE_EMULATORS = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1";

export const EMULATOR_PROJECT_ID = "demo-sidequest";

export function firebaseConfig(): FirebaseOptions | null {
  if (USE_EMULATORS) {
    return { apiKey: "demo-key", authDomain: "localhost", projectId: EMULATOR_PROJECT_ID, appId: "demo-app" };
  }
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}
