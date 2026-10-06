import { requireMember } from "@/lib/ai/guard";
import { runStructured } from "@/lib/ai/claude";
import { mockReroute } from "@/lib/ai/mocks";
import { REROUTE_SYSTEM, reroutePrompt } from "@/lib/ai/prompts/reroute";
import { describeTrip } from "@/lib/ai/prompts/trip-context";
import { readJson, RerouteRequestSchema } from "@/lib/ai/requests";
import { geocodeAll } from "@/lib/grounding/geocode";
import { weatherBrief } from "@/lib/grounding/weather-brief";
import { RerouteResultSchema, type DayDraft } from "@/lib/model/plan";
import { onCount, type JobStage } from "@/lib/ai/progress";
import { tripJob } from "@/lib/ai/tripJob";
import type { Usage } from "@/lib/ai/claude";
import { bearerToken, newDocId, restConfigured, type Write } from "@/lib/firebase/rest";
import type { StoredItem } from "@/lib/model/plan";
import { buildTripChanges, type ChangedDay } from "@/lib/plan/tripProposal";
import { streamJob } from "@/lib/ai/stream-job";

export const maxDuration = 300;
/** Stop Claude a little before Vercel's limit, so the phone gets a clear answer. */
const DEADLINE_MS = 270_000;

/**
 * Change the trip from a plain request. Opus juggles the whole itinerary and
 * returns only the days that change; new bases are looked up on the map here.
 * The phone turns the answer into a suggestion to accept or skip day by day.
 * Progress streams back as it goes (see lib/ai/progress.ts).
 */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;
  const body = await readJson(req, RerouteRequestSchema);
  if (!body.ok) return body.response;
  const { trip, inputs, days, instruction, focusDate, today, save } = body.data;
  const token = bearerToken(req);
  const me = gate.member.email;
  // The server can save the suggestion itself when it knows the plan it's based on.
  const canSave = Boolean(save && token && restConfigured() && days.every((d) => d.updatedAt !== undefined && d.items.every((i) => i.id)));

  return streamJob(async (send, announce) => {
    const job = canSave && save ? tripJob(token, save.tripId, me, save.requests) : null;
    const tracked = job ? await job.start() : false;
    if (tracked && job) announce(job.id);
    const progress = (stage: JobStage, extra?: { count?: number; total?: number }) => {
      send(stage, extra);
      if (tracked) job?.progress(stage, extra?.count);
    };

    const res = await planChanges(progress);
    if (!res.ok) {
      if (tracked) await job?.fail(res.error);
      return res;
    }
    if (!tracked || !job || !save) return { ok: true, data: { ...res.data, saved: null } };

    // Save the suggestion as the person who asked, so it lands even if their phone went quiet.
    progress("saving");
    const basisDays = days.map((d) => ({ date: d.date, base: d.base, title: d.title, updatedAt: d.updatedAt ?? 0 }));
    const basisItems: StoredItem[] = days.flatMap((d) =>
      d.items.map((i, order) => ({
        ...i,
        id: i.id!,
        dayDate: d.date,
        order,
        updatedAt: i.updatedAt ?? 0,
        source: "ai" as const,
        milestoneId: null,
        updatedBy: "",
      }))
    );
    const { changes, basedOn } = buildTripChanges(basisDays, basisItems, res.data.days);
    const now = Date.now();
    const proposalId = newDocId();
    const writes: Write[] = [];
    if (changes.length > 0) {
      for (const id of save.previous) writes.push({ update: `trips/${save.tripId}/tripProposals/${id}`, data: { status: "dismissed" } });
      writes.push({
        set: `trips/${save.tripId}/tripProposals/${proposalId}`,
        data: { instruction, focusDate, summary: res.data.summary, days: changes, basedOn, draftIds: save.draftIds, createdBy: me, createdAt: now, status: "pending" },
      });
    }
    if (res.data.usage) writes.push({ set: `trips/${save.tripId}/aiRuns/${newDocId()}`, data: { route: "reroute", ...res.data.usage, by: me, at: now } });
    const saved = await job.finish(writes);
    // If that didn't stick, the phone saves it the old way (when it's still there).
    if (!saved) await job.fail("The suggestion couldn't be saved on the server. If it doesn't show up, try again.");
    return { ok: true, data: { ...res.data, saved: saved ? { proposalId: changes.length ? proposalId : null, changedDays: changes.length } : null } };
  });

  /** Ask Claude for the changed days and look up any new places. */
  async function planChanges(
    progress: (stage: JobStage, extra?: { count?: number; total?: number }) => void
  ): Promise<{ ok: true; data: { summary: string; days: ChangedDay[]; usage: Usage | null } } | { ok: false; status: number; error: string }> {
    let summary: string;
    let changed: DayDraft[];
    let usage: Usage | null = null;
    progress("reading");
    if (process.env.AI_MOCK === "1") {
      ({ summary, days: changed } = mockReroute(days, focusDate, instruction));
      // Walk through the stages so the phone's progress can be tested.
      await pause(150);
      progress("thinking");
      await pause(instruction.includes("[mock:slow]") ? 4000 : 150);
      changed.forEach((_, i) => progress("writing", { count: i + 1 }));
      if (instruction.includes("[mock:too-long]")) {
        return { ok: false, status: 502, error: "Claude's answer ran too long and got cut off. Try fewer changes at once, or change one day at a time." };
      }
    } else {
      const weather = await weatherBrief(days, today);
      progress("thinking");
      const result = await runStructured(
        {
          role: "planner",
          effort: "medium",
          system: REROUTE_SYSTEM,
          prompt: reroutePrompt(describeTrip(trip, inputs, today), days, instruction, focusDate, weather),
          schema: RerouteResultSchema,
          maxTokens: 32000,
        },
        {
          deadlineMs: DEADLINE_MS,
          onText: onCount("date", (count) => progress("writing", { count })),
        }
      );
      if (!result.ok) return result;
      ({ summary, days: changed } = result.data);
      usage = result.usage;
    }

    // Only days that are on the trip, once each.
    const byDate = new Map(days.map((d) => [d.date, d]));
    const seen = new Set<string>();
    changed = changed.filter((d) => byDate.has(d.date) && !seen.has(d.date) && seen.add(d.date));

    // Look up new bases so sun times, weather, and van spots follow the move.
    progress("places");
    const moved = changed.filter((d) => d.base !== byDate.get(d.date)!.base).map((d) => d.base);
    const places = await geocodeAll(moved);
    return { ok: true, data: { summary, days: changed.map((d) => ({ ...d, place: places.get(d.base) ?? null })), usage } };
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
