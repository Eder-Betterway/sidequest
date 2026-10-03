"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so the app opens with no connection.
 *
 * The build id rides along as a query param. Each deploy registers a "new"
 * worker, which names its cache after that id and clears the old one, so a
 * phone never keeps serving last week's app shell.
 *
 * Skipped in dev: a caching worker fights with hot reload.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const version = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
    const register = () => {
      navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(version)}`).catch(() => {
        // Unsupported context (private mode, some in-app browsers). The app still works online.
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
