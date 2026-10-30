// The project-wide and note steps of the feedback diff: the project prompt,
// the beat grid, template inputs and shot cameras, then notes added, deleted,
// reworded and resolved. Layer steps are in `feedback-diff.ts`.
import { BEAT_GRID_FIELDS, type BeatGridPatch } from "./beat-grid-command";
import { noteLabel, short, value } from "./feedback-labels";
import { refused, type Builder, type Step } from "./feedback-builder";
import type { Note } from "./types";
import { stable } from "./feedback-residual";

export function projectSteps(b: Builder) {
  const id = b.current.project.id;
  if (
    stable(b.work.project.preferences) !== stable(b.current.project.preferences)
  ) {
    b.attempt([
      {
        command: {
          op: "set-preferences",
          preferences: b.current.project.preferences ?? null,
        },
        describe: () => "project model and licence preferences updated",
      },
    ]);
  }
  if (b.work.prompt !== b.current.prompt) {
    const words = b.current.prompt;
    const error = b.attempt([
      {
        command: { op: "set-prompt", text: words },
        describe: () =>
          words
            ? `project prompt rewritten: "${short(words, 80)}"`
            : "project prompt cleared",
      },
    ]);
    if (error)
      b.miss({
        kind: "project",
        id,
        field: "prompt",
        label: "project prompt rewritten",
        reason: refused(error),
      });
  }
  const wasSize = b.work.project.composition;
  const size = b.current.project.composition;
  if (wasSize.width !== size.width || wasSize.height !== size.height) {
    const error = b.attempt([
      {
        command: {
          op: "set-resolution",
          width: size.width,
          height: size.height,
        },
        describe: () =>
          `resolution ${wasSize.width} × ${wasSize.height} → ${size.width} × ${size.height}`,
      },
    ]);
    if (error)
      b.miss({
        kind: "project",
        id,
        field: "composition",
        label: "resolution changed",
        reason: refused(error),
      });
  }
  beatGridStep(b);
  const before = b.work.project.template,
    after = b.current.project.template;
  if (before && after && before.id === after.id) {
    const inputs: Record<string, unknown> = {};
    for (const key of ["subject", "title", "acoustic"] as const)
      if (
        JSON.stringify(before.inputs[key]) !==
          JSON.stringify(after.inputs[key]) &&
        after.inputs[key] !== undefined
      )
        inputs[key] = after.inputs[key];
    if (Object.keys(inputs).length) {
      const error = b.attempt([
        {
          command: { op: "set-template-inputs", inputs },
          describe: () =>
            `template ${Object.entries(inputs)
              .map(
                ([k, v]) =>
                  `${k} ${value(before.inputs[k as keyof typeof before.inputs])} → ${value(v)}`,
              )
              .join(", ")}`,
        },
      ]);
      if (error)
        b.miss({
          kind: "project",
          id,
          field: "template",
          label: "template inputs changed",
          reason: refused(error),
        });
    }
  }
  for (const plan of b.current.project.generationPlans) {
    const was = b.work.project.generationPlans.find((g) => g.id === plan.id);
    if (
      !was ||
      !plan.camera ||
      !plan.id.startsWith("plan-") ||
      JSON.stringify(was.camera) === JSON.stringify(plan.camera)
    )
      continue;
    const shotId = plan.id.slice(5);
    const camera = plan.camera;
    const error = b.attempt([
      {
        command: { op: "set-camera", shotId, camera },
        describe: () =>
          `shot ${shotId} camera: ${
            Object.values(camera).filter(Boolean).join(", ") || "no terms"
          }`,
      },
    ]);
    if (error)
      b.miss({
        kind: "project",
        id,
        field: `camera ${shotId}`,
        label: `shot ${shotId} camera changed`,
        reason: refused(error),
      });
  }
}

/**
 * Tempo, downbeat and beats per bar the person set, as one `set-beat-grid`.
 * A field removed has no command; the residual pass lists it.
 */
function beatGridStep(b: Builder) {
  const was = b.work.project.composition,
    now = b.current.project.composition;
  const grid: BeatGridPatch = {};
  for (const key of BEAT_GRID_FIELDS)
    if (now[key] !== undefined && now[key] !== was[key]) grid[key] = now[key];
  if (!Object.keys(grid).length) return;
  const error = b.attempt([
    {
      command: { op: "set-beat-grid", ...grid },
      describe: () =>
        `beat grid ${Object.entries(grid)
          .map(
            ([k, v]) =>
              `${k} ${value(was[k as keyof typeof grid])} → ${value(v)}`,
          )
          .join(", ")}`,
    },
  ]);
  if (error)
    b.miss({
      kind: "project",
      id: b.current.project.id,
      field: "composition",
      label: "beat grid changed",
      reason: refused(error),
    });
}

const noteContent = ({ resolved: _resolved, ...rest }: Note) =>
  JSON.stringify(rest);

/** Notes added, deleted, reworded (deleted and added again) and resolved. */
export function noteSteps(b: Builder) {
  const t = b.timing;
  const current = b.current.project.notes ?? [];
  const byId = new Map(current.map((n) => [n.id, n]));
  for (const n of b.work.project.notes ?? []) {
    const target = byId.get(n.id);
    if (target && noteContent(target) === noteContent(n)) continue;
    const layers = b.work.project.layers;
    const error = b.attempt([
      {
        command: { op: "delete-note", noteId: n.id },
        describe: () =>
          `${target ? "reworded or moved" : "deleted"} ${noteLabel(n, layers, t)}`,
      },
    ]);
    if (error)
      b.miss({
        kind: "note",
        id: n.id,
        field: "note",
        label: `deleted ${noteLabel(n, layers, t)}`,
        reason: refused(error),
      });
  }
  for (const n of current) {
    const now = (b.work.project.notes ?? []).find((o) => o.id === n.id);
    const steps: Step[] = [];
    if (!now)
      steps.push({
        command: {
          op: "add-note",
          noteId: n.id,
          frame: n.frame,
          text: n.text,
          ...(n.layerId !== undefined ? { layerId: n.layerId } : {}),
          ...(n.author ? { author: n.author } : {}),
          ...(n.createdAt ? { createdAt: n.createdAt } : {}),
        },
        describe: (_, after) => noteLabel(n, after.layers, t),
      });
    if (!!n.resolved !== !!now?.resolved && (now || n.resolved))
      steps.push({
        command: {
          op: "resolve-note",
          noteId: n.id,
          ...(n.resolved ? {} : { resolved: false }),
        },
        describe: (_, after) =>
          `${n.resolved ? "resolved" : "reopened"} ${noteLabel(n, after.layers, t)}`,
      });
    if (!steps.length) continue;
    const error = b.attempt(steps);
    if (error)
      b.miss({
        kind: "note",
        id: n.id,
        field: "note",
        label: noteLabel(n, b.current.project.layers, t),
        reason: refused(error),
      });
  }
}
