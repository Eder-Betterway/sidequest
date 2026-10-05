"use client";

import MicButton from "@/components/voice/MicButton";
import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Field, inputClass, Segmented } from "@/components/ui/fields";
import { addNote } from "@/lib/data/notes";
import { buildNote, MAX_NOTE_TEXT, type NoteDoc, type NoteKind } from "@/lib/model/note";
import { shrinkPhoto } from "./photo";

export interface DayChoice {
  date: string;
  label: string;
}

const PROMPTS: Record<NoteKind, { label: string; placeholder: string }> = {
  note: { label: "Note", placeholder: "Anything worth remembering" },
  tip: { label: "What did you hear?", placeholder: "The bartender says the hot springs are empty at dawn" },
  question: { label: "Your question", placeholder: "Can we park the van overnight at the trailhead?" },
  flyer: { label: "Anything to add (optional)", placeholder: "Saw this at the coffee shop" },
};

/** Jot something down. Saves instantly, signal or not, and both phones see it. */
export default function CaptureSheet({
  tripId,
  email,
  kinds,
  initialKind,
  days,
  initialDay,
  onClose,
}: {
  tripId: string;
  email: string;
  kinds: readonly NoteKind[];
  initialKind: NoteKind;
  days: DayChoice[];
  initialDay: string | null;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<NoteKind>(initialKind);
  const [text, setText] = useState("");
  const [dayDate, setDayDate] = useState<string | null>(initialDay);
  const [photo, setPhoto] = useState<NoteDoc["photo"]>(null);
  const [shrinking, setShrinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prompt = PROMPTS[kind];

  async function pick(file: File | undefined) {
    if (!file) return;
    setShrinking(true);
    setError(null);
    const shrunk = await shrinkPhoto(file);
    setShrinking(false);
    if (!shrunk) return setError("Couldn't read that photo. Try another one.");
    setPhoto(shrunk);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const built = buildNote({ kind, text, dayDate, photo: kind === "flyer" ? photo : undefined }, email, Date.now());
    if (!built.ok) return setError(built.error);
    addNote(tripId, built.note);
    onClose();
  }

  const title = kind === "flyer" ? "Snap a flyer" : kind === "tip" ? "Add a local tip" : kind === "question" ? "Ask a question" : "Add a note";

  return (
    <Sheet title={title} onClose={onClose}>
      <form className="space-y-4" onSubmit={save}>
        {kinds.length > 1 && <Segmented label="Kind" options={kinds} value={kind} onChange={(k) => { setKind(k); setError(null); }} />}

        {kind === "flyer" && (
          <div>
            <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border p-3 text-center text-sm font-medium text-muted">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`data:${photo.mediaType};base64,${photo.data}`} alt="Flyer to read" className="max-h-56 rounded-xl" />
              ) : shrinking ? (
                "Shrinking the photo..."
              ) : (
                "Take or choose a photo"
              )}
              <input type="file" accept="image/*" className="sr-only" aria-label="Flyer photo" onChange={(e) => pick(e.target.files?.[0])} />
            </label>
            <p className="mt-1 text-xs text-muted">The photo is read once there&apos;s signal, then only the events are kept.</p>
          </div>
        )}

        <Field label={prompt.label}>
          <textarea
            autoFocus={kind !== "flyer"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={prompt.placeholder}
            maxLength={MAX_NOTE_TEXT}
            rows={3}
            className={`${inputClass} py-2`}
          />
        </Field>
        <div className="-mt-3 flex justify-end">
          <MicButton value={text} onChange={setText} />
        </div>

        {days.length > 0 && (
          <Field label="About">
            <select value={dayDate ?? ""} onChange={(e) => setDayDate(e.target.value || null)} className={inputClass}>
              <option value="">The whole trip</option>
              {days.map((d) => (
                <option key={d.date} value={d.date}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {error && (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        )}
        <button type="submit" disabled={shrinking} className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50">
          {kind === "question" ? "Ask" : "Save"}
        </button>
        <p className="text-center text-xs text-muted">Saves with no signal too. Both phones see it.</p>
      </form>
    </Sheet>
  );
}

/** "Tue, Nov 3 · Joshua Tree" for the day pickers. */
export function dayChoices(days: { date: string; base: string }[]): DayChoice[] {
  return days.map((d) => ({
    date: d.date,
    label: `${new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} · ${d.base}`,
  }));
}
