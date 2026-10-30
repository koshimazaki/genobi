import type { ArenaDraft, ArenaSlot } from "../../shared/arena";
import {
  arenaRunInput,
  draftSettings,
  slotPrompt,
} from "../../shared/arena-run";
import { estimateRunUsd, type Quote } from "../../shared/quote";
import { readyEntry } from "../../shared/registry";
import type { GenerateInput, Job } from "../../shared/types";
import { runnable } from "./run-state";

/** One load's request, built exactly as it will be quoted and submitted. */
export interface PlannedRun {
  slot: ArenaSlot;
  input: GenerateInput;
}

/**
 * The runs a press makes: each chosen load that can run, on its own model,
 * with its own prompt (or the main one) and the shared settings fitted to it.
 */
export function planRuns(
  draft: ArenaDraft,
  slotIds: string[],
  jobs: Record<string, Job>,
  references: string[] = [],
): PlannedRun[] {
  const settings = draftSettings(draft);
  return draft.slots
    .filter((s) => slotIds.includes(s.id) && runnable(s, jobs))
    .map((slot) => ({
      slot,
      input: arenaRunInput(
        slot.run!.entry,
        slotPrompt(slot, draft),
        settings,
        references,
      ),
    }));
}

/**
 * The loads Generate all runs: each with a model, a prompt and no result yet.
 * A load with a result runs again only from its own Generate.
 */
export const generateAllLoads = (
  draft: ArenaDraft,
  jobs: Record<string, Job>,
) =>
  draft.slots.filter(
    (s) => !s.media && runnable(s, jobs) && slotPrompt(s, draft).trim(),
  );

/** One quote per load, in load order; any refusal stops the whole press. */
export const quoteRuns = (
  plans: PlannedRun[],
  quote: (input: GenerateInput) => Promise<Quote>,
) => Promise.all(plans.map((plan) => quote(plan.input)));

/** What Generate asks before spending: each load's quote, then the total. */
export function confirmText(plans: PlannedRun[], quotes: Quote[]) {
  const total = quotes.reduce((n, q) => n + q.estimateUsd, 0);
  const lines = plans.map(
    (plan, i) =>
      `${plan.slot.label}: $${quotes[i].estimateUsd.toFixed(2)}${plan.slot.media ? " (replaces its result)" : ""}`,
  );
  return `Generate ${plans.length} load${plans.length > 1 ? "s" : ""} for about $${total.toFixed(2)}?\n${lines.join("\n")}\nEach run is charged to your key.`;
}

/**
 * A load's price before quoting, from the same `estimateRunUsd` the studio's
 * quote states. A workflow on a local ComfyUI is quoted at nothing, which
 * only the server knows, so this stays an estimate; null when the load
 * has no model or no prompt yet.
 */
export function slotEstimate(draft: ArenaDraft, slot: ArenaSlot) {
  if (!slot.run?.entry || !slotPrompt(slot, draft).trim()) return null;
  try {
    return estimateRunUsd(
      arenaRunInput(
        slot.run.entry,
        slotPrompt(slot, draft),
        draftSettings(draft),
      ),
    );
  } catch {
    return null;
  }
}

/** What the shared settings become on this load's model, for its row. */
export function fittedSummary(draft: ArenaDraft, slot: ArenaSlot) {
  const entry = slot.run?.entry ? readyEntry(slot.run.entry) : undefined;
  if (!entry) return "";
  const input = arenaRunInput(entry.id, "x", draftSettings(draft));
  if (entry.generator === "image")
    return `${input.imageResolution?.toUpperCase()} · ${input.imageAspectRatio}`;
  return `${input.duration}s · ${input.aspectRatio} · ${input.resolution === "fhd" ? "Full HD" : input.resolution.toUpperCase()}`;
}
