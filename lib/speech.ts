"use client";

/**
 * Talk instead of type, and listen instead of read, using the phone's own
 * speech features (Web Speech API). Free, no account, and reading aloud works
 * with no signal. Dictation needs signal on some phones (iPhones send audio to
 * Apple). Everything here quietly does nothing where it isn't supported.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecognition = any;

function recognitionCtor(): (new () => AnyRecognition) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function canDictate(): boolean {
  return recognitionCtor() !== null;
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function lang(): string {
  return typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
}

/**
 * Listen until you stop talking (or `stop()` is called). `onText` gets the
 * running transcript of this session: final words plus the in-progress guess.
 */
export function dictate(handlers: {
  onText: (text: string, final: boolean) => void;
  onEnd: () => void;
  onError?: (message: string) => void;
}): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    handlers.onError?.("Dictation isn't available in this browser. The keyboard's mic works too.");
    handlers.onEnd();
    return () => {};
  }
  const r = new Ctor();
  r.lang = lang();
  r.interimResults = true;
  r.continuous = true;
  let finalText = "";
  r.onresult = (e: AnyRecognition) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    handlers.onText((finalText + interim).trim(), !interim);
  };
  r.onerror = (e: AnyRecognition) => {
    const code = e?.error as string | undefined;
    if (code === "no-speech" || code === "aborted") return;
    handlers.onError?.(
      code === "not-allowed" || code === "service-not-allowed"
        ? "Allow the microphone for Sidequest in your phone's settings to dictate."
        : code === "network"
          ? "Dictation needs signal on this phone. The note still saves if you type it."
          : "Dictation stopped. Try again."
    );
  };
  r.onend = () => handlers.onEnd();
  try {
    r.start();
  } catch {
    handlers.onEnd();
  }
  return () => {
    try {
      r.stop();
    } catch {
      // already stopped
    }
  };
}

let speakingListeners = new Set<(on: boolean) => void>();

export function onSpeakingChange(fn: (on: boolean) => void): () => void {
  speakingListeners.add(fn);
  return () => speakingListeners.delete(fn);
}

function setSpeaking(on: boolean) {
  speakingListeners.forEach((l) => l(on));
}

/** Read text aloud, replacing anything already being read. */
export function speak(text: string): void {
  if (!canSpeak() || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang();
  u.rate = 1;
  u.onstart = () => setSpeaking(true);
  u.onend = () => setSpeaking(false);
  u.onerror = () => setSpeaking(false);
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  setSpeaking(false);
}

/** For tests: forget listeners between runs. */
export function resetSpeechForTests() {
  speakingListeners = new Set();
}
