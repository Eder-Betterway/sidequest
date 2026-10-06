import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// A stand-in for the Anthropic client: each test says how the next stream ends.
let next: { text?: string; stop?: string; throws?: unknown } = {};
let heard: string[] = [];
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  const Real = actual.default;
  class Fake {
    beta = {
      messages: {
        stream: () => {
          const handlers: ((d: string, s: string) => void)[] = [];
          return {
            on: (_e: string, fn: (d: string, s: string) => void) => handlers.push(fn),
            finalMessage: async () => {
              if (next.throws) throw next.throws;
              const text = next.text ?? "";
              handlers.forEach((h) => h(text, text));
              return {
                stop_reason: next.stop ?? "end_turn",
                model: "claude-opus-5-5",
                content: [{ type: "text", text }],
                usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0 },
              };
            },
          };
        },
      },
    };
    static APIError = Real.APIError;
    static APIUserAbortError = Real.APIUserAbortError;
    static APIConnectionError = Real.APIConnectionError;
    static APIConnectionTimeoutError = Real.APIConnectionTimeoutError;
    static RateLimitError = Real.RateLimitError;
    static AuthenticationError = Real.AuthenticationError;
    static PermissionDeniedError = Real.PermissionDeniedError;
  }
  return { ...actual, default: Fake };
});

const { runStructured } = await import("@/lib/ai/claude");
const { readJob } = await import("@/lib/ai/client");
const { daysWritten } = await import("@/lib/ai/progress");
const { jobPercent } = await import("@/components/ui/JobProgress");
const Anthropic = (await import("@anthropic-ai/sdk")).default;

const call = { role: "planner" as const, effort: "medium" as const, system: "s", prompt: "p", schema: z.object({ summary: z.string() }) };

describe("calling Claude", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test";
    heard = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("parses a complete answer and reports text as it streams", async () => {
    next = { text: '{"summary":"Moved a day"}' };
    const res = await runStructured(call, { onText: (t) => heard.push(t) });
    expect(res).toMatchObject({ ok: true, data: { summary: "Moved a day" } });
    expect(heard).toEqual(['{"summary":"Moved a day"}']);
  });

  it("says plainly when the answer was cut off, instead of 'couldn't reach Claude'", async () => {
    next = { text: '{"summary":"Moved a d', stop: "max_tokens" };
    const res = await runStructured(call);
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/ran too long and got cut off/) });
  });

  it("names a wrong-shaped answer, a refusal, and each kind of failure", async () => {
    next = { text: '{"nope":1}' };
    expect(await runStructured(call)).toMatchObject({ ok: false, error: expect.stringMatching(/wrong shape/) });
    next = { text: "", stop: "refusal" };
    expect(await runStructured(call)).toMatchObject({ ok: false, status: 422 });
    next = { throws: new Anthropic.APIUserAbortError() };
    expect(await runStructured(call, { deadlineMs: 270_000 })).toMatchObject({ ok: false, status: 504, error: expect.stringMatching(/after 5 minutes/) });
    next = { throws: new Anthropic.APIConnectionError({ message: "down" }) };
    expect(await runStructured(call)).toMatchObject({ ok: false, error: expect.stringMatching(/couldn't reach Claude/) });
    next = { throws: new Anthropic.APIError(529, { type: "overloaded_error" }, "busy", new Headers()) };
    expect(await runStructured(call)).toMatchObject({ ok: false, error: expect.stringMatching(/very busy/) });
  });
});

describe("progress", () => {
  const streamOf = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        chunks.forEach((x) => c.enqueue(new TextEncoder().encode(x)));
        c.close();
      },
    });

  it("reads events split across chunks, skipping heartbeats", async () => {
    const seen: string[] = [];
    const out = await readJob(
      streamOf(['{"type":"progress","stage":"rea', 'ding"}\n{"type":"tick"}\n', '{"type":"progress","stage":"writing","count":2}\n{"type":"result","data":{"x":1}}\n']),
      (e) => seen.push(`${e.stage}${e.count ?? ""}`)
    );
    expect(seen).toEqual(["reading", "writing2"]);
    expect(out).toEqual({ type: "result", data: { x: 1 } });
  });

  it("returns the error event, or nothing if the stream just stops", async () => {
    expect(await readJob(streamOf(['{"type":"error","status":502,"error":"nope"}\n']), () => {})).toMatchObject({ error: "nope" });
    expect(await readJob(streamOf(['{"type":"progress","stage":"thinking"}\n']), () => {})).toBeNull();
  });

  it("counts days as Claude writes them", () => {
    expect(daysWritten('{"summary":"x","days":[{"date":"2026-11-03","base":"A","items":[]},{"date" : "2026-11-04"')).toBe(2);
    expect(daysWritten("")).toBe(0);
  });

  it("moves the bar forward with stages and time, never to 100", () => {
    const t0 = 1_000_000;
    const at = (stage: "reading" | "thinking" | "writing" | "places" | "saving", secs: number, count = 0) => jobPercent({ stage, count, startedAt: t0 }, t0 + secs * 1000, 90, 4);
    expect(at("thinking", 1)).toBeLessThan(at("thinking", 60));
    expect(at("thinking", 600)).toBeLessThan(35.01);
    expect(at("writing", 30, 2)).toBeGreaterThan(at("writing", 30, 1));
    expect(at("writing", 30, 9)).toBeLessThanOrEqual(90);
    expect(at("saving", 0)).toBeLessThan(100);
  });
});
