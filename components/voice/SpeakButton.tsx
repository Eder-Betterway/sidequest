"use client";

import { useEffect, useState } from "react";
import { canSpeak, onSpeakingChange, speak, stopSpeaking } from "@/lib/speech";

/** Read something aloud (works with no signal). Tap again to stop. */
export default function SpeakButton({ text, label = "Read aloud", className = "" }: { text: string; label?: string; className?: string }) {
  const [supported, setSupported] = useState(false);
  const [mine, setMine] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSupported(canSpeak()), 0);
    // Only one thing reads at a time: another button starting stops this one's state.
    const off = onSpeakingChange((on) => {
      if (!on) setMine(false);
    });
    return () => {
      clearTimeout(id);
      off();
    };
  }, []);

  if (!supported || !text.trim()) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (mine) {
          stopSpeaking();
          setMine(false);
        } else {
          speak(text);
          setMine(true);
        }
      }}
      aria-pressed={mine}
      className={`inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-accent ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
      </svg>
      {mine ? "Stop reading" : label}
    </button>
  );
}
