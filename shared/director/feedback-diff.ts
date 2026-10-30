// The diff behind feedback: two copies of a project (the agent's revision,
// the base, and the person's current one) become an ordered list of existing
// Director commands that turns the base into the current, each with a short
// label. Every command is applied with `applyCommand` as it is chosen, so the
// list is known to apply in order; a change no command reproduces, or one
// the base refuses, is listed in `unmapped` with the reason. A final
// comparison of the replayed copy with the current one lists whatever is
// still different, so no change is dropped silently.
import type { DirectorCommand, DirectorCopy } from "./commands";
import {
  Builder,
  layerById,
  PLACEMENT,
  refused,
  TIMING,
  type Diff,
  type Step,
} from "./feedback-builder";
import {
  addedLabel,
  layerName,
  parametersLabel,
  placementLabel,
  timingLabel,
  timingOf,
} from "./feedback-labels";
import { noteSteps, projectSteps } from "./feedback-project";
import { promptSteps } from "./feedback-prompts";
import { residual } from "./feedback-residual";
import type { Placement } from "./layer-commands";
import { lanes, laneId } from "./tracks";
import { checkReferences, type Layer } from "./types";

export {
  LABEL_LIMIT,
  UNMAPPED_KINDS,
  type Diff,
  type LabelledCommand,
  type Unmapped,
} from "./feedback-builder";

/**
 * The base with the files the person added since (assets, and the
 * generations that made them), so commands that place a new file apply,
 * and with the person's recipe definitions in place of its own. No command
 * adds a file; each added one is listed in `unmapped`.
 */
export function startingCopy(
  base: DirectorCopy,
  current: DirectorCopy,
): DirectorCopy {
  const b = base.project,
    c = current.project;
  const assets = Object.fromEntries(
    Object.entries(c.assets).filter(([id]) => !b.assets[id]),
  );
  const generations = c.generations.filter(
    (g) => !b.generations.some((o) => o.id === g.id),
  );
  // Recipes as the person's project defines them: set-parameters checks
  // values against these, never against rules the base brought with it.
  const modules = Object.fromEntries(
    Object.entries(b.modules).map(([id, m]) => [id, c.modules[id] ?? m]),
  );
  const project = {
    ...b,
    assets: { ...b.assets, ...assets },
    modules,
    generations: [...b.generations, ...generations],
  };
  try {
    checkReferences(project);
    return { ...base, project };
  } catch {
    return { ...base, project: { ...b, modules } };
  }
}

/** The commands that turn `base` into `current`, and what none can do. */
export function diffCopies(base: DirectorCopy, current: DirectorCopy): Diff {
  const b = new Builder(
    startingCopy(base, current),
    current,
    timingOf(current.project.composition),
  );
  projectSteps(b);
  plateSteps(b);
  timingSteps(b);
  addSteps(b);
  lookSteps(b);
  promptSteps(b);
  noteSteps(b);
  residual(b, base);
  return { commands: b.commands, unmapped: b.unmapped };
}

/** A picture layer that shows another file: `replace-plate`. */
function plateSteps(b: Builder) {
  for (const target of b.current.project.layers) {
    const now = b.layer(target.id);
    if (
      !now ||
      !("assetId" in now) ||
      !("assetId" in target) ||
      now.assetId === target.assetId ||
      target.kind === "audio"
    )
      continue;
    const error = b.attempt([
      {
        command: {
          op: "replace-plate",
          layerId: target.id,
          assetId: target.assetId,
        },
        describe: () => `${layerName(now)} now shows asset ${target.assetId}`,
      },
    ]);
    if (error)
      b.miss(
        {
          kind: "layer",
          id: target.id,
          field: "assetId",
          label: `${layerName(now)} now shows asset ${target.assetId}`,
          reason: refused(error),
        },
        ["kind", "sourceStartFrame"],
      );
  }
}

const sourceOf = (l: Layer) =>
  "sourceStartFrame" in l
    ? l.sourceStartFrame
    : "moduleId" in l
      ? (l.animationOffsetFrames ?? 0)
      : 0;

/**
 * Ways to reach the target's start, length, in-point and track. A left trim
 * moves the in-point (or recipe clock) with the start, so an in-point change
 * is a trim to where the source lines up, then a move; or the move first.
 */
function timingVariants(b: Builder, now: Layer, target: Layer): Step[][] {
  const ds = target.startFrame - now.startFrame;
  const dr = sourceOf(target) - sourceOf(now);
  const resized = target.durationFrames !== now.durationFrames;
  const lane = laneId(target);
  const moveLane = lane !== laneId(now);
  if (!ds && !dr && !resized && !moveLane) return [];
  const known = lanes(b.work.project.layers).some((l) => l.id === lane);
  const track = moveLane ? { track: known ? lane : "new" } : {};
  const step = (command: DirectorCommand): Step => ({
    command,
    describe: (before, after) =>
      timingLabel(
        layerById(before, now.id),
        layerById(after, now.id),
        b.timing,
      ),
  });
  const trim = (startFrame: number) =>
    step({
      op: "trim-clip",
      layerId: now.id,
      startFrame,
      durationFrames: target.durationFrames,
    });
  const move = (startFrame: number) =>
    step({ op: "move-clip", layerId: now.id, startFrame, ...track });
  const variants: Step[][] = [];
  const trimAt = now.startFrame + dr;
  if (trimAt >= 0)
    variants.push([
      ...(trimAt !== now.startFrame || resized ? [trim(trimAt)] : []),
      ...(trimAt !== target.startFrame || moveLane
        ? [move(target.startFrame)]
        : []),
    ]);
  const moveTo = target.startFrame - dr;
  if (moveTo >= 0)
    variants.push([
      ...(moveTo !== now.startFrame || moveLane ? [move(moveTo)] : []),
      ...(dr || resized ? [trim(target.startFrame)] : []),
    ]);
  return variants.filter((v) => v.length);
}

/** Moves, trims, in-points and tracks, retried while any succeeds. */
function timingSteps(b: Builder) {
  let pending = b.current.project.layers.filter((l) => b.layer(l.id));
  const errors = new Map<string, string>();
  for (let progress = true; progress && pending.length;) {
    progress = false;
    pending = pending.filter((target) => {
      const now = b.layer(target.id)!;
      const variants = timingVariants(b, now, target);
      if (!variants.length) return false;
      const error = b.attemptAny(variants);
      if (!error) progress = true;
      else errors.set(target.id, error);
      return !!error;
    });
  }
  for (const target of pending) {
    const now = b.layer(target.id)!;
    b.miss(
      {
        kind: "layer",
        id: target.id,
        field: "timing",
        label: timingLabel(now, target, b.timing),
        reason: refused(errors.get(target.id) ?? ""),
      },
      TIMING,
    );
  }
}

/** New clips and recipe layers, in the person's stacking order. */
function addSteps(b: Builder) {
  for (const target of b.current.project.layers) {
    if (b.layer(target.id)) continue;
    const lane = laneId(target);
    const known =
      target.track !== undefined &&
      lanes(b.work.project.layers).some((l) => l.id === lane);
    const common = {
      layerId: target.id,
      track: known ? lane : "new",
      startFrame: target.startFrame,
      durationFrames: target.durationFrames,
      ...(target.name !== target.id ? { name: target.name } : {}),
    };
    const command: DirectorCommand =
      "assetId" in target
        ? {
            op: "add-clip",
            assetId: target.assetId,
            ...common,
            ...("sourceStartFrame" in target && target.sourceStartFrame
              ? { sourceStartFrame: target.sourceStartFrame }
              : {}),
          }
        : { op: "add-graphic", moduleId: target.moduleId, ...common };
    const error = b.attempt([
      { command, describe: () => addedLabel(target, b.timing) },
    ]);
    if (error)
      b.miss({
        kind: "layer",
        id: target.id,
        field: "layer",
        label: addedLabel(target, b.timing),
        reason: refused(error),
      });
  }
}

/** Placement and recipe parameters, on every layer both copies hold. */
function lookSteps(b: Builder) {
  for (const target of b.current.project.layers) {
    const now = b.layer(target.id);
    if (!now) continue;
    const name = layerName(now);
    if ("opacity" in now && "opacity" in target) {
      const placement: Placement = {};
      if (
        now.position.x !== target.position.x ||
        now.position.y !== target.position.y
      )
        placement.position = { ...target.position };
      for (const k of ["scale", "opacity", "rotationDegrees"] as const)
        if (now[k] !== target[k]) placement[k] = target[k];
      if (JSON.stringify(now.motion) !== JSON.stringify(target.motion))
        placement.motion = target.motion ? { ...target.motion } : null;
      if (Object.keys(placement).length) {
        const error = b.attempt([
          {
            command: { op: "set-placement", layerId: now.id, ...placement },
            describe: () => placementLabel(name, now, target),
          },
        ]);
        if (error)
          b.miss(
            {
              kind: "layer",
              id: now.id,
              field: "placement",
              label: placementLabel(name, now, target),
              reason: refused(error),
            },
            PLACEMENT,
          );
      }
    }
    // Another recipe on the same layer is listed, not set (feedback-residual).
    if (
      "parameters" in now &&
      "parameters" in target &&
      now.moduleId === target.moduleId
    ) {
      const changed = Object.entries(target.parameters).filter(
        ([k, v]) => now.parameters[k] !== v,
      );
      // set-parameters takes up to 32 names at a time.
      for (let i = 0; i < changed.length; i += 32) {
        const parameters = Object.fromEntries(changed.slice(i, i + 32));
        const label = parametersLabel(name, now.parameters, parameters);
        const error = b.attempt([
          {
            command: { op: "set-parameters", layerId: now.id, parameters },
            describe: () => label,
          },
        ]);
        if (error)
          b.miss({
            kind: "layer",
            id: now.id,
            field: "parameters",
            label,
            reason: refused(error),
          });
      }
    }
  }
}
