import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as ask } from "@/app/api/ai/ask/route";
import { POST as flyer } from "@/app/api/ai/flyer/route";
import { POST as replan } from "@/app/api/ai/replan/route";
import { flyerPrompt } from "@/lib/ai/prompts/flyer";
import { askPrompt } from "@/lib/ai/prompts/ask";
import { defaultInputs } from "@/lib/model/inputs";
import {
  authorLabel,
  buildNote,
  defaultNoteDay,
  eventDay,
  fitWithin,
  MAX_PHOTO_CHARS,
  replanNoteFor,
  sortNotes,
  unanswered,
} from "@/lib/model/note";
import { formatAskPlan } from "@/lib/plan/brief";

const NOW = 1_790_000_000_000;

describe("buildNote", () => {
  it("saves a tip with who added it and which day it's about", () => {
    const r = buildNote({ kind: "tip", text: "  Hot springs are empty at dawn ", dayDate: "2026-11-03" }, "Me@Example.com", NOW);
    expect(r).toEqual({
      ok: true,
      note: {
        kind: "tip",
        text: "Hot springs are empty at dawn",
        dayDate: "2026-11-03",
        createdBy: "me@example.com",
        createdAt: NOW,
        updatedAt: NOW,
        usedAt: null,
      },
    });
  });

  it("gives questions an empty answer and flyers their photo", () => {
    const q = buildNote({ kind: "question", text: "Open Mondays?", dayDate: null }, "me@example.com", NOW);
    expect(q.ok && q.note.answer).toBeNull();
    const photo = { mediaType: "image/jpeg" as const, data: "abc" };
    const f = buildNote({ kind: "flyer", text: "", dayDate: null, photo }, "me@example.com", NOW);
    expect(f.ok && f.note).toMatchObject({ photo, events: null, text: "" });
  });

  it("refuses empty notes, missing or huge flyer photos, and long text", () => {
    expect(buildNote({ kind: "note", text: " ", dayDate: null }, "me@example.com", NOW)).toEqual({ ok: false, error: "Write something first." });
    expect(buildNote({ kind: "question", text: "", dayDate: null }, "me@example.com", NOW)).toEqual({ ok: false, error: "Type your question." });
    expect(buildNote({ kind: "flyer", text: "", dayDate: null }, "me@example.com", NOW).ok).toBe(false);
    const big = { mediaType: "image/jpeg" as const, data: "x".repeat(MAX_PHOTO_CHARS + 1) };
    expect(buildNote({ kind: "flyer", text: "", dayDate: null, photo: big }, "me@example.com", NOW).ok).toBe(false);
    expect(buildNote({ kind: "note", text: "x".repeat(1001), dayDate: null }, "me@example.com", NOW).ok).toBe(false);
  });
});

describe("note helpers", () => {
  const dates = ["2026-11-02", "2026-11-03", "2026-11-04"];

  it("defaults to today on the trip, else the whole trip", () => {
    expect(defaultNoteDay(dates, "2026-11-03")).toBe("2026-11-03");
    expect(defaultNoteDay(dates, "2026-10-01")).toBeNull();
  });

  it("puts flyer events on their day only when it's a trip day", () => {
    expect(eventDay({ date: "2026-11-04" }, dates)).toBe("2026-11-04");
    expect(eventDay({ date: "2026-12-01" }, dates)).toBeNull();
    expect(eventDay({ date: null }, dates)).toBeNull();
  });

  it("labels who added it", () => {
    expect(authorLabel("me@example.com", " ME@example.com")).toBe("You");
    expect(authorLabel("partner@example.com", "me@example.com")).toBe("partner");
  });

  it("works answered questions into the re-plan with the answer", () => {
    expect(replanNoteFor({ kind: "tip", text: "Go at dawn", answer: undefined })).toBe("Go at dawn");
    expect(replanNoteFor({ kind: "question", text: "Busy Saturday?", answer: { text: "Very. Go Friday.", sources: [], answeredAt: 1 } })).toBe(
      "We asked: Busy Saturday?\nAnswer we got: Very. Go Friday."
    );
    expect(replanNoteFor({ kind: "tip", text: "x".repeat(1200), answer: null })).toHaveLength(1000);
  });

  it("only the phone that asked fetches the answer", () => {
    const notes = [
      { kind: "question" as const, answer: null, createdBy: "me@example.com" },
      { kind: "question" as const, answer: null, createdBy: "partner@example.com" },
      { kind: "question" as const, answer: { text: "a", sources: [], answeredAt: 1 }, createdBy: "me@example.com" },
      { kind: "tip" as const, answer: undefined, createdBy: "me@example.com" },
    ];
    expect(unanswered(notes, "Me@example.com")).toEqual([notes[0]]);
  });

  it("sorts newest first", () => {
    expect(sortNotes([{ createdAt: 1 }, { createdAt: 3 }, { createdAt: 2 }]).map((n) => n.createdAt)).toEqual([3, 2, 1]);
  });

  it("shrinks photos to fit without upscaling", () => {
    expect(fitWithin(4032, 3024, 1280)).toEqual({ w: 1280, h: 960 });
    expect(fitWithin(3024, 4032, 1280)).toEqual({ w: 960, h: 1280 });
    expect(fitWithin(800, 600, 1280)).toEqual({ w: 800, h: 600 });
  });
});

describe("prompts", () => {
  it("tells the flyer reader today's weekday so 'Saturday' resolves", () => {
    expect(flyerPrompt({ startDate: "2026-11-02", endDate: "2026-11-04" }, "2026-11-03", "Joshua Tree")).toContain(
      "Today is Tuesday 2026-11-03. The trip runs 2026-11-02 to 2026-11-04. They snapped this near Joshua Tree."
    );
  });

  it("gives questions the plan and recent notes", () => {
    const days = [{ date: "2026-11-03", base: "Joshua Tree", title: "Rocks", items: [{ start: "20:00", title: "Concert", place: "Pioneertown", locked: true }] }];
    expect(formatAskPlan(days)).toBe("- 2026-11-03, Joshua Tree: Rocks\n  - 20:00 Concert @ Pioneertown (locked)");
    const p = askPrompt("Trip: x", "Where to eat?", "2026-11-03", days, ["Try the taco truck"]);
    expect(p).toContain("- Try the taco truck");
    expect(p).toContain("The question is about 2026-11-03.");
    expect(askPrompt("Trip: x", "Q", null, [], [])).toContain("- Not planned yet.");
  });
});

// ---------- Routes (stand-in AI, emulator-style tokens) ----------

const env = { ...process.env };
beforeAll(() => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-routes";
  process.env.ALLOWED_EMAILS = "me@example.com";
  process.env.AI_MOCK = "1";
});
afterAll(() => {
  process.env = env;
});

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (email: string) => `${b64({ alg: "none", typ: "JWT" })}.${b64({ aud: "demo-routes", sub: "u1", email })}.`;
const post = (body: unknown, email: string | null = "me@example.com") =>
  new Request("http://localhost/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", ...(email ? { authorization: `Bearer ${token(email)}` } : {}) },
    body: JSON.stringify(body),
  });
const trip = { title: "Desert loop", startDate: "2026-11-02", endDate: "2026-11-04" };
const inputs = { ...defaultInputs(), regions: ["Joshua Tree"], modes: ["campervan"] };

describe("POST /api/ai/ask", () => {
  const body = { trip, inputs, question: "Can we camp at the trailhead?", today: "2026-11-01" };

  it("401s signed out, 403s strangers, 400s bad input", async () => {
    expect((await ask(post(body, null))).status).toBe(401);
    expect((await ask(post(body, "stranger@example.com"))).status).toBe(403);
    expect((await ask(post({ ...body, question: "" }))).status).toBe(400);
  });

  it("answers with sources", async () => {
    const res = await ask(post(body));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.text).toContain("Can we camp at the trailhead?");
    expect(json.sources[0].url).toMatch(/^https:/);
  });
});

describe("POST /api/ai/flyer", () => {
  const body = { trip, image: "a".repeat(200), mediaType: "image/jpeg", today: "2026-11-01" };

  it("401s signed out and 400s a bad image", async () => {
    expect((await flyer(post(body, null))).status).toBe(401);
    expect((await flyer(post({ ...body, mediaType: "image/heic" }))).status).toBe(400);
    expect((await flyer(post({ ...body, image: "short" }))).status).toBe(400);
  });

  it("returns events", async () => {
    const res = await flyer(post(body));
    expect(res.status).toBe(200);
    expect((await res.json()).events[0]).toMatchObject({ title: "Night market", date: "2026-11-02" });
  });
});

describe("POST /api/ai/replan with a tip", () => {
  it("works the tip in", async () => {
    const res = await replan(
      post({
        trip,
        inputs,
        day: { date: "2026-11-03", base: "Joshua Tree", title: "Rocks" },
        items: [],
        vibe: inputs.vibe,
        note: "Hot springs are empty at dawn",
        today: "2026-11-01",
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).items.at(-1).title).toBe("Tip: Hot springs are empty at dawn");
  });
});
