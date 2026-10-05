"use client";

import { useEffect, useRef, useState } from "react";
import { canDictate, dictate } from "@/lib/speech";

/**
 * Tap to talk into a text box. What you say is added after what's already
 * there, live as you speak. Tap again (or pause) to stop. Hidden where the
 * phone can't dictate.
 */
export default function MicButton({
  value,
  onChange,
  label = "Dictate",
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const base = useRef("");

  // Checked after mount: the server doesn't know what the phone supports.
  useEffect(() => {
    const id = setTimeout(() => setSupported(canDictate()), 0);
    return () => {
      clearTimeout(id);
      stop.current?.();
    };
  }, []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      stop.current?.();
      return;
    }
    setError(null);
    base.current = value.trim();
    setListening(true);
    stop.current = dictate({
      onText: (text) => onChange([base.current, text].filter(Boolean).join(" ")),
      onEnd: () => {
        setListening(false);
        stop.current = null;
      },
      onError: setError,
    });
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={toggle}
        aria-label={listening ? "Stop dictating" : label}
        aria-pressed={listening}
        className={`flex h-11 w-11 items-center justify-center rounded-full border ${
          listening ? "animate-pulse border-accent bg-accent text-on-accent" : "border-border text-muted"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>
      {error && (
        <span role="alert" className="mt-1 max-w-56 text-right text-xs text-warn">
          {error}
        </span>
      )}
    </span>
  );
}
