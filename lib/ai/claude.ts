import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { FALLBACK_ROLES, MODELS, type ModelRole } from "./models";

/**
 * The one way the app calls Claude. Every call:
 * - picks its model by role (lib/ai/models.ts),
 * - asks for JSON that must match a zod schema (structured outputs),
 * - opts into server-side fallbacks, so if a model declines, another answers,
 * - returns token usage so the app can log what it spent.
 *
 * Server only. Routes check the signed-in member (lib/ai/guard.ts) first.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  /** Web searches run (billed per search on top of tokens). */
  webSearches?: number;
}

export type AiResult<T> = { ok: true; data: T; usage: Usage } | { ok: false; status: number; error: string };

export interface StructuredCall<S extends z.ZodType> {
  role: ModelRole;
  /** Ignored for the "quick" role: Haiku 4.5 rejects the effort setting. */
  effort: Effort;
  /** Stable instructions. Cached, so keep anything that varies per request out of it. */
  system: string;
  prompt: string;
  /** Photos sent ahead of the prompt (base64, no "data:" prefix). */
  images?: { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }[];
  schema: S;
  maxTokens?: number;
}

let client: Anthropic | null = null;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) || process.env.AI_MOCK === "1";
}

export interface StreamOptions {
  /** Called as the answer streams in, with everything written so far. */
  onText?: (soFar: string) => void;
  /** Give up after this long, with a clear message (keep it under the route's maxDuration). */
  deadlineMs?: number;
}

export async function runStructured<S extends z.ZodType>(call: StructuredCall<S>, opts: StreamOptions = {}): Promise<AiResult<z.infer<S>>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, status: 503, error: "The AI isn't set up on the server yet (ANTHROPIC_API_KEY)." };
  }
  client ??= new Anthropic();
  const fallback = FALLBACK_ROLES.has(call.role);
  // Send the schema without the SDK's auto-parse, so a cut-off answer is
  // caught by its stop reason below instead of failing as a parse error.
  const { parse, ...format } = betaZodOutputFormat(call.schema);

  try {
    // Streamed, so long answers don't hit request timeouts and progress can be shown.
    const stream = client.beta.messages.stream(
      {
        model: MODELS[call.role],
        max_tokens: call.maxTokens ?? 16000,
        system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: [
              ...(call.images ?? []).map((img) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
              })),
              { type: "text" as const, text: call.prompt },
            ],
          },
        ],
        output_config: {
          ...(call.role === "quick" ? {} : { effort: call.effort }),
          format,
        },
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      opts.deadlineMs ? { signal: AbortSignal.timeout(opts.deadlineMs) } : undefined
    );
    if (opts.onText) stream.on("text", (_delta, soFar) => opts.onText!(soFar));
    const response = await stream.finalMessage();

    if (response.stop_reason === "refusal") {
      return { ok: false, status: 422, error: "Claude couldn't help with that one. Try rewording it." };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, status: 502, error: "Claude's answer ran too long and got cut off. Try fewer changes at once, or change one day at a time." };
    }
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let data: z.infer<S>;
    try {
      data = parse(text) as z.infer<S>;
    } catch (err) {
      console.error("Claude answer didn't match the schema", err);
      return { ok: false, status: 502, error: "Claude's answer came back in the wrong shape. Try again." };
    }
    return {
      ok: true,
      data,
      usage: {
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  } catch (err) {
    return { ok: false, ...friendlyError(err, opts.deadlineMs) };
  }
}

/** What went wrong, in words for the phone. Logged in full on the server. */
export function friendlyError(err: unknown, deadlineMs?: number): { status: number; error: string } {
  console.error("Claude call failed", err);
  const minutes = deadlineMs ? Math.round(deadlineMs / 60_000) : null;
  if (err instanceof Anthropic.APIUserAbortError || (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"))) {
    return {
      status: 504,
      error: `Claude was still working after ${minutes ?? "several"} minutes, so it stopped. Try fewer changes at once, or one day at a time.`,
    };
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { status: 504, error: "Claude took too long to answer. Try again." };
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, error: "The server couldn't reach Claude. Try again in a moment." };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, error: "Too many requests right now. Give it a minute." };
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { status: 503, error: "The server's Claude key isn't working. Check ANTHROPIC_API_KEY." };
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529) return { status: 503, error: "Claude is very busy right now. Try again in a minute." };
    if (err.status === 400) return { status: 502, error: "Claude didn't accept the request. Try again; if it keeps happening, it's a bug to report." };
    if (typeof err.status === "number" && err.status >= 500) return { status: 502, error: "Claude had a hiccup on its end. Try again in a moment." };
    return { status: 502, error: "Claude had a problem. Try again in a moment." };
  }
  return { status: 502, error: "Something went wrong talking to Claude. Try again in a moment." };
}

/** Sum usage across several calls (e.g. day chunks). */
export function addUsage(list: Usage[]): Usage {
  return list.reduce(
    (acc, u) => ({
      model: acc.model || u.model,
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + u.cacheReadTokens,
      webSearches: (acc.webSearches ?? 0) + (u.webSearches ?? 0),
    }),
    { model: "", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, webSearches: 0 }
  );
}
