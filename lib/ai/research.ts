import Anthropic from "@anthropic-ai/sdk";
import type { Source } from "@/lib/model/place";
import { MODELS } from "./models";
import type { Usage } from "./claude";

/**
 * A Claude call with web search that returns cited notes, not JSON (citations
 * and structured outputs can't be combined in one call). Resumes the server's
 * search loop if it pauses, and collects every cited source.
 */

const MAX_CONTINUATIONS = 3;

export type ResearchResult = { ok: true; notes: string; sources: Source[]; usage: Usage } | { ok: false; status: number; error: string };

let client: Anthropic | null = null;

/** Every web source the answer actually cites, deduplicated by URL. */
export function collectSources(content: Anthropic.Beta.BetaContentBlock[]): Source[] {
  const seen = new Map<string, Source>();
  for (const block of content) {
    if (block.type !== "text" || !block.citations) continue;
    for (const c of block.citations) {
      if (c.type === "web_search_result_location" && !seen.has(c.url)) {
        seen.set(c.url, { title: c.title ?? new URL(c.url).hostname, url: c.url });
      }
    }
  }
  return [...seen.values()];
}

export function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export async function research(system: string, prompt: string, maxSearches = 4): Promise<ResearchResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, status: 503, error: "The AI isn't set up on the server yet (ANTHROPIC_API_KEY)." };
  }
  client ??= new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  const usage: Usage = { model: "", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  try {
    for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
      const response = await client.beta.messages.create({
        model: MODELS.everyday,
        max_tokens: 8000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches }],
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      usage.model ||= response.model;
      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
      usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;

      if (response.stop_reason === "refusal") {
        return { ok: false, status: 422, error: "Claude couldn't research that one." };
      }
      if (response.stop_reason === "pause_turn") {
        // The server's search loop paused; send its work back and it resumes.
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      const notes = textOf(response.content).trim();
      if (!notes) return { ok: false, status: 502, error: "The research came back empty. Try again." };
      return { ok: true, notes, sources: collectSources(response.content), usage };
    }
    return { ok: false, status: 502, error: "The research took too long. Try again." };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { ok: false, status: 429, error: "Too many requests right now. Give it a minute." };
    if (err instanceof Anthropic.APIError) {
      console.error("Claude research error", err.status, err.message);
      return { ok: false, status: 502, error: "Claude had a problem. Try again in a moment." };
    }
    console.error("Claude research failed", err);
    return { ok: false, status: 502, error: "Couldn't reach Claude. Try again in a moment." };
  }
}
