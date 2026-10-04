"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Field, inputClass, Toggle } from "@/components/ui/fields";
import { useOnline } from "@/components/shell/useOnline";
import { setRules } from "@/lib/data/plan";
import type { TripInputs } from "@/lib/model/inputs";
import type { Trip } from "@/lib/model/trip";
import { rerouteTrip } from "./reroute";
import type { PlanState } from "./usePlan";

export function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Tell Sidequest what should change, for one day or the whole trip. It can
 * move where you sleep across several days. "Keep as a rule" makes it a
 * mandate every future re-plan follows.
 */
export default function ChangeSheet({
  trip,
  inputs,
  plan,
  email,
  focusDate,
  onClose,
  onReview,
}: {
  trip: Trip;
  inputs: TripInputs;
  plan: PlanState;
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const instruction = text.trim();
    if (!instruction) return;
    setError(null);
    setResult(null);
    let next = inputs;
    if (rule) {
      const ruleText = focusDate ? `On ${focusDate}: ${instruction}` : instruction;
      if (!inputs.rules.includes(ruleText)) {
        next = { ...inputs, rules: [...inputs.rules, ruleText].slice(-30) };
        setRules(trip.id, next.rules);
      }
    }
    setBusy(true);
    const res = await rerouteTrip({ trip, inputs: next, plan, instruction, focusDate, email });
    setBusy(false);
    if (!res.ok) return setError(rule ? `${res.error} Your rule is saved.` : res.error);
    if (res.changedDays === 0) return setResult(`No changes needed. ${res.summary}`);
    onReview();
  }

  return (
    <Sheet title={focusDate ? `Change ${longDate(focusDate)}` : "Change the trip"} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <Field
          label="What should change?"
          hint="Where you stay, what you do, or both. Sidequest moves neighboring days if it has to, and you approve each one."
        >
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder={
              focusDate ? "We need to still be in Palm Springs this day for the wedding" : "Head to Joshua Tree for the last two nights"
            }
            className={`${inputClass} py-2`}
          />
        </Field>
        <Toggle label="Keep as a rule for every re-plan" checked={rule} onChange={setRule} />
        {error && (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        )}
        {result && <p className="rounded-xl bg-surface-2 p-3 text-sm">{result}</p>}
        <button
          type="submit"
          disabled={busy || !online || !text.trim()}
          className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50"
        >
          {busy ? "Working it out... (up to a minute)" : online ? "Suggest changes" : "Needs signal"}
        </button>
      </form>
    </Sheet>
  );
}
