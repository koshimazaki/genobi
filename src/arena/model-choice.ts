import type { ArenaSlot } from "../../shared/arena";
import { arenaRunEntries, runName } from "../../shared/arena-run";
import type { ReadyEntry } from "../../shared/registry";

/** The menu value of a load that records a result without running a model. */
export const RECORD_ONLY = "";

/** Where an entry runs, as the menu says beside its name. */
export const routeName = (entry: ReadyEntry) =>
  entry.route === "workflow"
    ? "Workflow (run location)"
    : entry.route === "bfl"
      ? "BFL API"
      : "Comfy Router";

/**
 * The rows of a load's Model menu: every entry Arena can run, by the name
 * the Camera's model menu gives it, then Record only. A fixed list, not a
 * datalist, so the rows offered never depend on what the field holds.
 */
export function modelChoices() {
  return [
    ...arenaRunEntries().map((entry) => ({
      value: entry.id,
      label: runName(entry),
      note: routeName(entry),
      tag:
        entry.route === "workflow"
          ? "Workflow"
          : entry.route === "bfl"
            ? "BFL"
            : "Router",
      generator: entry.generator,
    })),
    {
      value: RECORD_ONLY,
      label: "Record only",
      note: "Keep this load as a manual result",
      tag: "",
      generator: null,
    },
  ];
}

/** The row a load's menu shows as chosen. */
export const modelValue = (slot: Pick<ArenaSlot, "run">) =>
  slot.run?.entry ?? RECORD_ONLY;

/**
 * What choosing a row changes, whatever the load held before: the run entry
 * and its recorded name together. A new model is a new request, so the old
 * idempotency key and job go with the old model. Record only keeps the name
 * the person typed and drops the run.
 */
export function chooseModel(
  slot: Pick<ArenaSlot, "run" | "model">,
  value: string,
): Partial<ArenaSlot> {
  if (value === RECORD_ONLY) return { run: undefined };
  const entry = arenaRunEntries().find((e) => e.id === value);
  if (!entry) throw new Error("Choose a model Arena can run.");
  // The same model again keeps its saved key, so a lost answer still replays.
  if (slot.run?.entry === entry.id) return { model: runName(entry) };
  return { run: { entry: entry.id }, model: runName(entry) };
}
