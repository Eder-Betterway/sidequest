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
}

export type AiResult<T> = { ok: true; data: T; usage: Usage } | { ok: false; status: number; error: string };

export interface StructuredCall<S extends z.ZodType> {
  role: ModelRole;
  effort: Effort;
  /** Stable instructions. Cached, so keep anything that varies per request out of it. */
  system: string;
  prompt: string;
  schema: S;
  maxTokens?: number;
}

let client: Anthropic | null = null;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) || process.env.AI_MOCK === "1";
}

export async function runStructured<S extends z.ZodType>(call: StructuredCall<S>): Promise<AiResult<z.infer<S>>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, status: 503, error: "The AI isn't set up on the server yet (ANTHROPIC_API_KEY)." };
  }
  client ??= new Anthropic();
  const fallback = FALLBACK_ROLES.has(call.role);

  try {
    const response = await client.beta.messages.parse({
      model: MODELS[call.role],
      max_tokens: call.maxTokens ?? 16000,
      system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: call.prompt }],
      output_config: { effort: call.effort, format: betaZodOutputFormat(call.schema) },
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, status: 422, error: "Claude couldn't help with that one. Try rewording it." };
    }
    if (response.stop_reason === "max_tokens") {
      return { ok: false, status: 502, error: "The answer ran too long. Try a shorter trip or fewer days at once." };
    }
    if (!response.parsed_output) {
      return { ok: false, status: 502, error: "Claude's answer came back in the wrong shape. Try again." };
    }
    return {
      ok: true,
      data: response.parsed_output as z.infer<S>,
      usage: {
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, status: 429, error: "Too many requests right now. Give it a minute." };
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, status: 503, error: "The server's Claude key isn't working. Check ANTHROPIC_API_KEY." };
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Claude API error", err.status, err.message);
      return { ok: false, status: 502, error: "Claude had a problem. Try again in a moment." };
    }
    console.error("Claude call failed", err);
    return { ok: false, status: 502, error: "Couldn't reach Claude. Try again in a moment." };
  }
}

/** Sum usage across several calls (e.g. day chunks). */
export function addUsage(list: Usage[]): Usage {
  return list.reduce(
    (acc, u) => ({
      model: acc.model || u.model,
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + u.cacheReadTokens,
    }),
    { model: "", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 }
  );
}
