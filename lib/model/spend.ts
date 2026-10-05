/**
 * What the AI has cost, worked out from the usage the app logs after every
 * Claude call (`trips/{id}/aiRuns`). An estimate: Anthropic's console has the
 * real bill, and @claude code changes on GitHub aren't counted here.
 */

export interface AiRun {
  route: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  webSearches?: number;
  by: string;
  at: number;
}

/** US dollars per million tokens. */
interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

/** By model family, so a fallback to a sibling model still prices sensibly. */
const PRICES: { prefix: string; price: Price }[] = [
  { prefix: "claude-opus", price: { input: 4, output: 20, cacheRead: 0.2 } },
  { prefix: "claude-sonnet", price: { input: 2, output: 10, cacheRead: 0.2 } },
  { prefix: "claude-haiku", price: { input: 1, output: 5, cacheRead: 0.1 } },
];
const UNKNOWN = PRICES[1].price;
/** Web search is billed per search: $10 per 1,000. */
const PER_SEARCH = 0.01;

export function priceFor(model: string): Price {
  return PRICES.find((p) => model.startsWith(p.prefix))?.price ?? UNKNOWN;
}

export function runCost(r: Pick<AiRun, "model" | "inputTokens" | "outputTokens" | "cacheReadTokens" | "webSearches">): number {
  const p = priceFor(r.model);
  const n = (v: number | undefined) => (typeof v === "number" && v > 0 ? v : 0);
  return (n(r.inputTokens) * p.input + n(r.outputTokens) * p.output + n(r.cacheReadTokens) * p.cacheRead) / 1e6 + n(r.webSearches) * PER_SEARCH;
}

/** Midnight on the 1st of this month, phone time. */
export function monthStart(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

const ROUTE_LABELS: Record<string, string> = {
  options: "Trip options",
  expand: "Planning days",
  replan: "Re-planning days",
  reroute: "Trip changes",
  place: "Place write-ups",
  ask: "Questions",
  flyer: "Flyers",
};

export interface SpendSummary {
  total: number;
  runs: number;
  /** Biggest first. */
  byWhat: { label: string; cost: number }[];
  byWho: { email: string; cost: number }[];
}

export function summarizeSpend(runs: AiRun[], since: number): SpendSummary {
  const recent = runs.filter((r) => r.at >= since);
  const what = new Map<string, number>();
  const who = new Map<string, number>();
  let total = 0;
  for (const r of recent) {
    const c = runCost(r);
    total += c;
    const label = ROUTE_LABELS[r.route] ?? "Other";
    what.set(label, (what.get(label) ?? 0) + c);
    who.set(r.by, (who.get(r.by) ?? 0) + c);
  }
  const sorted = <K extends string>(m: Map<string, number>, key: K) =>
    [...m].map(([k, cost]) => ({ [key]: k, cost }) as { [P in K]: string } & { cost: number }).sort((a, b) => b.cost - a.cost);
  return { total, runs: recent.length, byWhat: sorted(what, "label"), byWho: sorted(who, "email") };
}

export function formatUsd(n: number): string {
  if (n > 0 && n < 0.01) return "under $0.01";
  return `$${n.toFixed(2)}`;
}
