import { z } from "zod";
import type { Source } from "./place";

/**
 * Notes: what you pick up on the road. A note, a tip from a local, a question,
 * or a flyer photo. Saved with the trip (`trips/{id}/notes/{noteId}`), works
 * offline, and records who added it. Tips turn into plan suggestions, questions
 * get answered with the trip in mind, and flyers turn into plan items.
 */

export const NOTE_KINDS = ["note", "tip", "question", "flyer"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const MAX_NOTE_TEXT = 1000;

/** A flyer photo waits in the note (shrunk on the phone) until there's signal to read it. Firestore caps a record at 1 MB. */
export const MAX_PHOTO_CHARS = 900_000;

export const FlyerEventSchema = z.object({
  title: z.string().describe("The event's name as printed"),
  date: z
    .string()
    .nullable()
    .describe("ISO date YYYY-MM-DD when the flyer pins it to a date (resolve weekdays using today's date and the trip dates), else null"),
  start: z.string().nullable().describe("Local start time HH:MM (24h), or null"),
  end: z.string().nullable().describe("Local end time HH:MM (24h), or null"),
  place: z.string().nullable().describe("Venue or address as printed, or null"),
  notes: z.string().describe("Price, lineup, or 'bring cash' style details in one short line, or empty"),
});
export type FlyerEvent = z.infer<typeof FlyerEventSchema>;

export const FlyerResultSchema = z.object({
  events: z.array(FlyerEventSchema).describe("One entry per distinct event; empty if the image has no events"),
});

export interface NoteAnswer {
  text: string;
  sources: Source[];
  answeredAt: number;
}

export interface NoteDoc {
  kind: NoteKind;
  text: string;
  /** The day it's about, or null for the whole trip. */
  dayDate: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  /** Set once it's been turned into a plan suggestion or plan items. */
  usedAt?: number | null;
  /** Questions: the answer, once there's signal. */
  answer?: NoteAnswer | null;
  /** Flyers: the shrunk photo (data, no "data:" prefix), cleared once read. */
  photo?: { mediaType: "image/jpeg"; data: string } | null;
  /** Flyers: what was read off it. */
  events?: FlyerEvent[] | null;
}

export interface Note extends NoteDoc {
  id: string;
  pending: boolean;
}

export type NoteResult = { ok: true; note: NoteDoc } | { ok: false; error: string };

/** Validate the capture form and shape it into a record. */
export function buildNote(
  input: { kind: NoteKind; text: string; dayDate: string | null; photo?: NoteDoc["photo"] },
  me: string,
  now: number
): NoteResult {
  const text = input.text.trim();
  if (input.kind === "flyer") {
    if (!input.photo) return { ok: false, error: "Add a photo of the flyer." };
    if (input.photo.data.length > MAX_PHOTO_CHARS) return { ok: false, error: "That photo is too big even after shrinking. Try a closer crop." };
  } else if (!text) {
    return { ok: false, error: input.kind === "question" ? "Type your question." : "Write something first." };
  }
  if (text.length > MAX_NOTE_TEXT) return { ok: false, error: `Keep it under ${MAX_NOTE_TEXT} characters.` };
  return {
    ok: true,
    note: {
      kind: input.kind,
      text,
      dayDate: input.dayDate,
      createdBy: me.trim().toLowerCase(),
      createdAt: now,
      updatedAt: now,
      usedAt: null,
      ...(input.kind === "question" ? { answer: null } : {}),
      ...(input.kind === "flyer" ? { photo: input.photo ?? null, events: null } : {}),
    },
  };
}

/** Which day a new note is about by default: today if it's a trip day, else the whole trip. */
export function defaultNoteDay(dates: string[], today: string): string | null {
  return dates.includes(today) ? today : null;
}

/** The plan day a flyer event lands on, or null if its date isn't on the trip. */
export function eventDay(event: Pick<FlyerEvent, "date">, dates: string[]): string | null {
  return event.date && dates.includes(event.date) ? event.date : null;
}

/** "You", or the start of the other person's email. */
export function authorLabel(createdBy: string, me: string): string {
  return createdBy === me.trim().toLowerCase() ? "You" : createdBy.split("@")[0];
}

/** What the re-planner is asked to work in, for a tip or an answered question. */
export function replanNoteFor(note: Pick<NoteDoc, "kind" | "text" | "answer">): string {
  const said = note.kind === "question" && note.answer ? `We asked: ${note.text}\nAnswer we got: ${note.answer.text}` : note.text;
  return said.slice(0, MAX_NOTE_TEXT);
}

/** Questions asked with no signal (or that failed) and still need an answer. */
export function unanswered<T extends Pick<Note, "kind" | "answer" | "createdBy">>(notes: T[], me: string): T[] {
  const self = me.trim().toLowerCase();
  // Only the phone that asked fetches the answer, so two phones don't pay twice.
  return notes.filter((n) => n.kind === "question" && !n.answer && n.createdBy === self);
}

/** Newest first. */
export function sortNotes<T extends Pick<NoteDoc, "createdAt">>(notes: T[]): T[] {
  return [...notes].sort((a, b) => b.createdAt - a.createdAt);
}

/** Longest edge for flyer photos: enough to read small print, small enough to save offline. */
export const PHOTO_MAX_EDGE = 1280;

/** Scale (w, h) to fit inside `max` on the long edge, never upscaling. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}
