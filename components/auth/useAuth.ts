"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebase } from "@/lib/firebase/client";

export type AuthState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signedOut" }
  | { status: "signedIn"; uid: string; email: string };

/**
 * Who's signed in on this phone. Firebase remembers the sign-in on the device,
 * so this resolves to "signedIn" even with no signal.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    const fb = getFirebase();
    if (!fb) {
      // Deferred so the first render stays identical to the server's.
      const id = setTimeout(() => setState({ status: "unconfigured" }), 0);
      return () => clearTimeout(id);
    }
    return onAuthStateChanged(fb.auth, (user) => {
      setState(
        user?.email
          ? { status: "signedIn", uid: user.uid, email: user.email.toLowerCase() }
          : { status: "signedOut" }
      );
    });
  }, []);

  return state;
}
