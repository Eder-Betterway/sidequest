"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Field, inputClass, Toggle } from "@/components/ui/fields";
import { useOnline } from "@/components/shell/useOnline";
import { addDraft, deleteDraft, updateDraft } from "@/lib/data/drafts";
import { setRules } from "@/lib/data/plan";
import { buildDraft, combineRequests, draftsFor, MAX_DRAFT_TEXT, ruleText, type ChangeDraft, type Request } from "@/lib/model/draft";
import type { TripInputs } from "@/lib/model/inputs";
import type { Trip } from "@/lib/model/trip";
import { rerouteTrip } from "./reroute";
import MicButton from "@/components/voice/MicButton";
import type { PlanState } from "./usePlan";

export function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

export function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Tell Sidequest what should change, for one day or the whole trip. Save it
 * as a draft (works offline) to collect several, or suggest changes now: all
 * drafts in view go to Claude together. "Keep as a rule" makes it a mandate
 * every future re-plan follows.
 */
export default function ChangeSheet({
  trip,
  inputs,
  plan,
  drafts,
  email,
  focusDate,
  onClose,
  onReview,
}: {
  trip: Trip;
  inputs: TripInputs;
  plan: PlanState;
  drafts: ChangeDraft[];
  email: string;
  focusDate: string | null;
  onClose: () => void;
  onReview: () => void;
}) {
  const online = useOnline();
  const [text, setText] = useState("");
  const [rule, setRule] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scoped = draftsFor(drafts, focusDate);
  const typed = text.trim();
  const count = scoped.length + (typed ? 1 : 0);

  function saveDraft() {
    const built = buildDraft({ text, dayDate: focusDate, rule }, email);
    if (!built.ok) return setError(built.error);
    addDraft(trip.id, built.draft);
    setText("");
    setRule(false);
    setError(null);
    setResult(null);
  }

  async function suggest(e: React.FormEvent) {
    e.preventDefault();
    if (count === 0) return;
    setError(null);
    setResult(null);
    const requests: (Request & { rule: boolean })[] = [
      ...scoped.map((d) => ({ text: d.text, dayDate: d.dayDate, rule: d.rule })),
      ...(typed ? [{ text: typed, dayDate: focusDate, rule }] : []),
    ];

    // Rules are saved right away, signal or not.
    let next = inputs;
    const newRules = requests.filter((r) => r.rule).map(ruleText).filter((r) => !inputs.rules.includes(r));
    if (newRules.length) {
      next = { ...inputs, rules: [...inputs.rules, ...newRules].slice(-30) };
      setRules(trip.id, next.rules);
    }

    const { instruction, focusDate: focus } = combineRequests(requests, focusDate);
    setBusy(true);
    const res = await rerouteTrip({ trip, inputs: next, plan, instruction, focusDate: focus, draftIds: scoped.map((d) => d.id), email });
    setBusy(false);
    if (!res.ok) {
      // Nothing typed gets lost: it waits as a draft.
      if (typed) saveDraft();
      return setError(typed ? `${res.error} Saved as a draft.` : res.error);
    }
    if (res.changedDays === 0) return setResult(`No changes needed. ${res.summary}`);
    onReview();
  }

  return (
    <Sheet title={focusDate ? `Change ${longDate(focusDate)}` : "Change the trip"} onClose={onClose}>
      <form className="space-y-4" onSubmit={suggest}>
        {scoped.length > 0 && (
          <section aria-label="Draft changes">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Draft changes</p>
            <ul className="mt-1 space-y-2">
              {scoped.map((d) => (
                <DraftCard key={d.id} tripId={trip.id} draft={d} days={plan.days.map((x) => x.date)} showDay={focusDate === null} email={email} />
              ))}
            </ul>
          </section>
        )}

        <Field
          label={scoped.length ? "Add another change" : "What should change?"}
          hint="Where you stay, what you do, or both. Save drafts to collect a few, then suggest them together."
        >
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_DRAFT_TEXT}
            rows={3}
            placeholder={
              focusDate ? "We need to still be in Palm Springs this day for the wedding" : "Head to Joshua Tree for the last two nights"
            }
            className={`${inputClass} py-2`}
          />
        </Field>
        <div className="-mt-3 flex justify-end">
          <MicButton value={text} onChange={setText} />
        </div>
        <Toggle label="Keep as a rule for every re-plan" checked={rule} onChange={setRule} />
        {error && (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        )}
        {result && <p className="rounded-xl bg-surface-2 p-3 text-sm">{result}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={saveDraft}
            disabled={busy || !typed}
            className="min-h-12 flex-1 rounded-xl border border-border font-medium disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            type="submit"
            disabled={busy || !online || count === 0}
            className="min-h-12 flex-[2] rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50"
          >
            {busy ? "Working it out..." : !online ? "Suggesting needs signal" : count > 1 ? `Suggest ${count} changes` : "Suggest changes"}
          </button>
        </div>
        <p className="text-center text-xs text-muted">
          {busy ? "This takes up to a minute." : "Drafts save with no signal. Nothing changes until you approve it."}
        </p>
      </form>
    </Sheet>
  );
}

/** One saved draft: read it, fix it in place, move it to another day, or remove it. */
function DraftCard({
  tripId,
  draft,
  days,
  showDay,
  email,
}: {
  tripId: string;
  draft: ChangeDraft;
  days: string[];
  showDay: boolean;
  email: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft.text);
  const [dayDate, setDayDate] = useState<string | null>(draft.dayDate);
  const [rule, setRule] = useState(draft.rule);
  const [error, setError] = useState<string | null>(null);

  function start() {
    // Start from what's saved now, in case the other phone changed it.
    setText(draft.text);
    setDayDate(draft.dayDate);
    setRule(draft.rule);
    setError(null);
    setEditing(true);
  }

  function save() {
    const built = buildDraft({ text, dayDate, rule }, email);
    if (!built.ok) return setError(built.error);
    updateDraft(tripId, draft.id, { text: built.draft.text, dayDate, rule }, email);
    setEditing(false);
  }

  if (editing) {
    return (
      <li aria-label="Editing draft" className="space-y-3 rounded-xl border-2 border-accent bg-surface p-3 text-sm">
        <textarea
          aria-label="Draft text"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_DRAFT_TEXT}
          rows={3}
          className={`${inputClass} py-2`}
        />
        <div className="flex items-center gap-2">
          {showDay && days.length > 0 && (
            <select aria-label="Which day" value={dayDate ?? ""} onChange={(e) => setDayDate(e.target.value || null)} className={`${inputClass} min-w-0 flex-1`}>
              <option value="">Whole trip</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  {shortDate(d)}
                </option>
              ))}
            </select>
          )}
          <span className="ml-auto">
            <MicButton value={text} onChange={setText} />
          </span>
        </div>
        <Toggle label="Keep as a rule for every re-plan" checked={rule} onChange={setRule} />
        {error && (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(false)} className="min-h-11 flex-1 rounded-xl border border-border font-medium">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!text.trim()} className="min-h-11 flex-[2] rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50">
            Save changes
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm">
      <span className="min-w-0 flex-1">
        {showDay && <span className="block text-xs font-semibold text-muted">{draft.dayDate ? shortDate(draft.dayDate) : "Whole trip"}</span>}
        {draft.text}
        {draft.rule && <span className="block text-xs text-accent">Will be kept as a rule</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <button type="button" aria-label={`Edit draft: ${draft.text}`} onClick={start} className="min-h-9 px-1 text-xs font-medium text-accent underline">
          Edit
        </button>
        <button
          type="button"
          aria-label={`Remove draft: ${draft.text}`}
          onClick={() => deleteDraft(tripId, draft.id)}
          className="min-h-9 px-1 text-xs text-muted underline"
        >
          Remove
        </button>
      </span>
    </li>
  );
}
