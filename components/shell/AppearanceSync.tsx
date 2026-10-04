"use client";

import { useEffect } from "react";
import { applyAppearance, getAppearance } from "@/lib/appearance";

/** "Match phone" follows the phone switching between light and dark while the app is open. */
export default function AppearanceSync() {
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => {
      const a = getAppearance();
      if (a.theme === "auto") applyAppearance(a);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return null;
}
