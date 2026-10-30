// The working state of the feedback diff (`feedback-diff.ts`): the base
// copy with each chosen command applied, the labelled commands so far, and
// the changes no command could make. Commands are applied as they are
// chosen, so the list is known to apply in order.
import {
  applyCommand,
  type DirectorCommand,
  type DirectorCopy,
} from "./commands";
import { short, type Timing } from "./feedback-labels";
import { clean } from "./layer-commands";
import type { Project } from "./types";

export interface LabelledCommand {
  command: DirectorCommand;
  label: string;
}
export const UNMAPPED_KINDS = [
  "project",
  "layer",
  "note",
  "asset",
  "recipe",
] as const;
export interface Unmapped {
  kind: (typeof UNMAPPED_KINDS)[number];
  /** The layer, note, asset or recipe id; the project's id for the project. */
  id: string;
  field: string;
  label: string;
  reason: string;
}
export interface Diff {
  commands: LabelledCommand[];
  unmapped: Unmapped[];
}
/** A label's length in characters; the feedback reader holds it there too. */
export const LABEL_LIMIT = 300;
const text = (label: string) => short(clean(label), LABEL_LIMIT);

export interface Step {
  command: DirectorCommand;
  describe: (before: Project, after: Project) => string;
}
export const PLACEMENT = [
  "position",
  "scale",
  "opacity",
  "rotationDegrees",
  "motion",
];
export const TIMING = [
  "startFrame",
  "durationFrames",
  "sourceStartFrame",
  "animationOffsetFrames",
  "track",
];

/** The working copy, the commands chosen so far and what none could do. */
export class Builder {
  commands: LabelledCommand[] = [];
  unmapped: Unmapped[] = [];
  private seen = new Set<string>();
  constructor(
    public work: DirectorCopy,
    readonly current: DirectorCopy,
    readonly timing: Timing,
  ) {}

  /** Apply the steps all or none; the refusal, or "" once they applied. */
  attempt(steps: Step[]) {
    let copy = this.work;
    const done: LabelledCommand[] = [];
    for (const step of steps) {
      const result = applyCommand(copy, step.command);
      if (!result.ok) return result.error;
      done.push({
        command: step.command,
        label: text(step.describe(copy.project, result.copy.project)),
      });
      copy = result.copy;
    }
    this.work = copy;
    this.commands.push(...done);
    return "";
  }
  /** The first variant that applies; else the last refusal. */
  attemptAny(variants: Step[][]) {
    let error = "No command sequence reproduces this";
    for (const steps of variants) {
      error = this.attempt(steps) || "";
      if (!error) return "";
    }
    return error;
  }
  /** List a change once; `covers` names fields this entry already explains. */
  miss(entry: Unmapped, covers: string[] = []) {
    const key = `${entry.kind}:${entry.id}:${entry.field}`;
    if (this.seen.has(key)) return;
    for (const field of [entry.field, ...covers])
      this.seen.add(`${entry.kind}:${entry.id}:${field}`);
    this.unmapped.push({
      ...entry,
      label: text(entry.label),
      reason: text(entry.reason),
    });
  }
  layer(id: string) {
    return this.work.project.layers.find((l) => l.id === id);
  }
}

export const refused = (error: string) =>
  `Refused against the agent's revision: ${error}`;
export const layerById = (p: Project, id: string) =>
  p.layers.find((l) => l.id === id)!;
