import { requireMember } from "@/lib/ai/guard";
import { daysWritten } from "@/lib/ai/progress";
import { streamJob } from "@/lib/ai/stream-job";
import { addUsage, runStructured, type Usage } from "@/lib/ai/claude";
import { mockDays } from "@/lib/ai/mocks";
import { EXPAND_SYSTEM, expandPrompt } from "@/lib/ai/prompts/expand";
import { describeTrip } from "@/lib/ai/prompts/trip-context";
import { ExpandRequestSchema, MAX_TRIP_DAYS, readJson } from "@/lib/ai/requests";
import { geocodeAll } from "@/lib/grounding/geocode";
import { dayCount } from "@/lib/model/inputs";
import { DaysResultSchema, type DayDraft } from "@/lib/model/plan";
import { chunkDates, normalizeDays, pinMilestones, stopsByDate } from "@/lib/plan/schedule";

export const maxDuration = 300;
const DEADLINE_MS = 270_000;

/** Days per Claude call. Small enough to stay quick, big enough to keep flow between days. */
const CHUNK = 4;

/** Turn the chosen option into a day-by-day plan with places and pinned milestones. */
export async function POST(req: Request) {
  const gate = await requireMember(req);
  if (!gate.ok) return gate.response;

  const body = await readJson(req, ExpandRequestSchema);
  if (!body.ok) return body.response;
  const { trip, inputs, option, today } = body.data;
  if (trip.endDate < trip.startDate || dayCount(trip.startDate, trip.endDate) > MAX_TRIP_DAYS) {
    return Response.json({ error: "Check the trip dates." }, { status: 400 });
  }

  const dates = stopsByDate(option, trip.startDate, trip.endDate);

  return streamJob(async (progress) => {
    let drafts: DayDraft[];
    let usage: Usage | null = null;
    const total = dates.length;
    progress("reading");

    if (process.env.AI_MOCK === "1") {
      drafts = mockDays(dates);
      progress("thinking");
      await pause(100);
      drafts.forEach((_, i) => progress("writing", { count: i + 1, total }));
    } else {
      const brief = describeTrip(trip, inputs, today);
      const started = Date.now();
      const chunks = chunkDates(trip.startDate, trip.endDate, CHUNK);
      // Days written so far in each chunk, added up for the phone.
      const written = chunks.map(() => 0);
      let last = -1;
      const report = () => {
        const count = written.reduce((a, b) => a + b, 0);
        if (count !== last) {
          last = count;
          progress("writing", { count, total });
        }
      };
      const run = (c: { from: string; to: string }, i: number) =>
        runStructured(
          {
            role: "everyday",
            effort: "medium",
            system: EXPAND_SYSTEM,
            prompt: expandPrompt(brief, option, dates, c.from, c.to),
            schema: DaysResultSchema,
            maxTokens: 16000,
          },
          {
            deadlineMs: DEADLINE_MS - (Date.now() - started),
            onText: (soFar) => {
              written[i] = daysWritten(soFar);
              report();
            },
          }
        );
      progress("thinking");
      // The first chunk warms the prompt cache; the rest run in parallel and reuse it.
      const first = await run(chunks[0], 0);
      const rest = await Promise.all(chunks.slice(1).map((c, i) => run(c, i + 1)));
      const results = [first, ...rest];
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) return failed;
      drafts = results.flatMap((r) => (r.ok ? r.data.days : []));
      usage = addUsage(results.flatMap((r) => (r.ok ? [r.usage] : [])));
    }

    progress("places");
    const days = normalizeDays(drafts, dates);
    const places = await geocodeAll(days.map((d) => d.base));
    return {
      ok: true,
      data: {
        days: days.map((d) => ({
          date: d.date,
          base: d.base,
          title: d.title,
          place: places.get(d.base) ?? null,
          items: pinMilestones(d, inputs.milestones),
        })),
        usage,
      },
    };
  });
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
