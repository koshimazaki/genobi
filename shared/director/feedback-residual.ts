// The last pass of the feedback diff: the base with every chosen command
// applied, compared with the person's project. Whatever still differs is a
// change no Director command made, and is listed in `unmapped` with the
// reason, unless an earlier refusal already explains it.
import type { DirectorCopy } from "./commands";
import type { Builder } from "./feedback-builder";
import { layerName, short, value } from "./feedback-labels";
import type { Layer, Note, Project } from "./types";

/** JSON with sorted keys, so two equal values compare equal. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(v);
}

/**
 * A layer as it plays: fields that read the same when absent (no mute, no
 * recipe offset, the layer's own lane) are left out, so a command that
 * writes the default does not read as a change.
 */
export function normalLayer(l: Layer): Record<string, unknown> {
  const out: Record<string, unknown> = { ...l };
  if (!out.muted) delete out.muted;
  if (!out.animationOffsetFrames) delete out.animationOffsetFrames;
  if (out.track === l.id) delete out.track;
  return out;
}
/** A project as feedback compares it: no revision or base, notes by id. */
export function normalProject(p: Project) {
  const {
    revision: _revision,
    feedbackBase: _base,
    notes = [],
    layers,
    ...rest
  } = p;
  return {
    ...rest,
    layers: layers.map(normalLayer),
    notes: [...notes].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
/** True when the two copies play, read and look the same. */
export const sameCopy = (a: DirectorCopy, b: DirectorCopy) =>
  a.prompt === b.prompt &&
  stable(normalProject(a.project)) === stable(normalProject(b.project));

const LAYER_REASONS: Record<string, string> = {
  name: "No Director command renames a layer",
  locked: "No Director command locks or unlocks a layer",
  moduleId: "No Director command swaps a layer's recipe",
  parameters: "set-parameters sets values; it cannot remove one",
  track:
    "Director commands reach an existing track or a new one with its own id",
};
const PROJECT_REASONS: Record<string, string> = {
  name: "No Director command renames the project",
  composition:
    "Resolution and beat grid have Director commands; change frame rate or length, or clear a tempo field, in the studio",
  modules: "No Director command adds, removes or changes a recipe",
  generations: "No Director command records a generation",
  generationPlans:
    "Plan prompts follow set-camera and set-template-inputs; this change is not one they make",
  template: "set-template-inputs changes subject, title and room only",
};
const OTHER = "No Director command reproduces this change";

function keys(a: object, b: object) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])];
}

export function residual(b: Builder, base: DirectorCopy) {
  const work = b.work.project,
    now = b.current.project,
    id = now.id;
  if (b.work.prompt !== b.current.prompt)
    b.miss({
      kind: "project",
      id,
      field: "prompt",
      label: `project prompt: "${short(b.current.prompt, 80)}"`,
      reason: OTHER,
    });
  if ((work.globalPrompt ?? "") !== (now.globalPrompt ?? ""))
    b.miss({
      kind: "project",
      id,
      field: "globalPrompt",
      label: `global prompt: "${short(now.globalPrompt ?? "", 80)}"`,
      reason: OTHER,
    });
  if (work.name !== now.name)
    b.miss({
      kind: "project",
      id,
      field: "name",
      label: `project renamed ${value(work.name)} → ${value(now.name)}`,
      reason: PROJECT_REASONS.name,
    });
  for (const key of keys(work.composition, now.composition)) {
    const [was, is] = [work.composition, now.composition].map(
      (c) => (c as Record<string, unknown>)[key],
    );
    if (stable(was) !== stable(is))
      b.miss({
        kind: "project",
        id,
        field: `composition.${key}`,
        label: `${key} ${value(was)} → ${value(is)}`,
        reason: PROJECT_REASONS.composition,
      });
  }
  for (const asset of keys(work.assets, now.assets)) {
    const was = work.assets[asset],
      is = now.assets[asset];
    const added = !base.project.assets[asset] && is;
    if (!added && stable(was) === stable(is)) continue;
    b.miss({
      kind: "asset",
      id: asset,
      field: "asset",
      label: added
        ? `added ${is.kind} file ${is.file.path}`
        : !is
          ? `removed ${was.kind} file ${was.file.path}`
          : `asset ${asset} changed`,
      reason: added
        ? "No Director command adds a file; the project copy holds it, so the commands here that place it apply there"
        : !is
          ? "No Director command removes a file"
          : "No Director command changes a file",
    });
  }
  // Against the agent's own recipes: the working copy replays with the
  // person's trusted definitions, so comparing it would hide a swap.
  const was = base.project.modules;
  for (const recipe of keys(was, now.modules))
    if (stable(was[recipe]) !== stable(now.modules[recipe]))
      b.miss({
        kind: "recipe",
        id: recipe,
        field: "recipe",
        label: `recipe ${recipe} ${now.modules[recipe] ? (was[recipe] ? "changed" : "added") : "removed"}`,
        reason: PROJECT_REASONS.modules,
      });
  for (const field of ["generations", "generationPlans", "template"] as const)
    if (stable(work[field]) !== stable(now[field]))
      b.miss({
        kind: "project",
        id,
        field,
        label: `${field} changed`,
        reason: PROJECT_REASONS[field],
      });
  layerResidual(b);
  noteResidual(b);
}

function layerResidual(b: Builder) {
  const work = b.work.project.layers,
    now = b.current.project.layers;
  const current = new Map(now.map((l) => [l.id, l]));
  for (const l of work) {
    const target = current.get(l.id);
    if (!target) {
      b.miss({
        kind: "layer",
        id: l.id,
        field: "layer",
        label: `removed ${l.kind} ${layerName(l)}`,
        reason: "remove-clip could not reproduce this removal",
      });
      continue;
    }
    const a = normalLayer(l),
      c = normalLayer(target);
    for (const key of keys(a, c))
      if (stable(a[key]) !== stable(c[key]))
        b.miss({
          kind: "layer",
          id: l.id,
          field: key,
          label: `${layerName(l)} ${key} ${value(a[key])} → ${value(c[key])}`,
          reason: LAYER_REASONS[key] ?? OTHER,
        });
  }
  for (const l of now)
    if (!work.some((w) => w.id === l.id))
      b.miss({
        kind: "layer",
        id: l.id,
        field: "layer",
        label: `added ${l.kind} ${layerName(l)}`,
        reason: OTHER,
      });
  const ids = new Set(work.map((l) => l.id));
  const order = (layers: Layer[]) =>
    layers.filter((l) => ids.has(l.id) && current.has(l.id)).map((l) => l.id);
  if (order(work).join() !== order(now).join())
    b.miss({
      kind: "project",
      id: b.current.project.id,
      field: "layer order",
      label: `layers stack bottom to top as ${short(order(now).join(", "), 200)}`,
      reason:
        "No Director command restacks layers; move-clip onto a track puts the clip at the end of that track's run",
    });
}

function noteResidual(b: Builder) {
  const work = b.work.project.notes ?? [],
    now = b.current.project.notes ?? [];
  const all = new Map<string, [Note?, Note?]>();
  for (const n of work) all.set(n.id, [n, undefined]);
  for (const n of now) all.set(n.id, [all.get(n.id)?.[0], n]);
  for (const [note, [was, is]] of all)
    if (stable(was) !== stable(is))
      b.miss({
        kind: "note",
        id: note,
        field: "note",
        label: `note "${short((is ?? was)!.text, 120)}" ${!is ? "removed" : !was ? "added" : "changed"}`,
        reason: OTHER,
      });
}
