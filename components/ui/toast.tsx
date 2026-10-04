"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * One small message at a time, above the tab bar, with an optional action
 * ("Undo"). Goes away on its own.
 */

interface ToastMsg {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

let current: ToastMsg | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(text: string, action?: ToastMsg["action"]) {
  current = { id: ++seq, text, action };
  emit();
}

export function hideToast() {
  current = null;
  emit();
}

const SHOW_MS = 12_000;

export default function Toast() {
  const msg = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null
  );
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => {
      if (current?.id === msg.id) hideToast();
    }, SHOW_MS);
    return () => clearTimeout(id);
  }, [msg]);

  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 pb-safe">
      <div role="status" className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl bg-text px-4 py-2 text-sm text-bg shadow-lg">
        <span className="min-w-0 flex-1 py-1.5">{msg.text}</span>
        {msg.action && (
          <button
            type="button"
            onClick={() => {
              msg.action!.run();
              hideToast();
            }}
            className="min-h-11 shrink-0 px-2 font-semibold underline"
          >
            {msg.action.label}
          </button>
        )}
        <button type="button" aria-label="Dismiss" onClick={hideToast} className="min-h-11 shrink-0 px-1 opacity-70">
          ✕
        </button>
      </div>
    </div>
  );
}
