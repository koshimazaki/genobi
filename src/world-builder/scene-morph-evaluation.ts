import type { Recipe } from "./recipe";
import type { ModSource } from "./mod-routes";
import type { EvaluatedMorphControl } from "./scene-morph-control";
import {
  SCENE_CONTROL_DEFAULTS,
  type SceneControls,
  type SceneMotion,
  type SceneStateKey,
  type SceneTransform,
  type SceneVector,
} from "./scene-state";
import { clampSceneValue as clamp } from "./scene-transform";
import { blendSceneColors } from "./scene-color";

function signal(recipe: Recipe, source: ModSource, frame: number): number {
  const data =
    source === "level" ? recipe.envelope : recipe.bandEnvelopes[source];
  if (!data?.length) return 0;
  const index = Math.floor(frame);
  const a = data[index] ?? 0,
    b = data[index + 1] ?? a;
  return clamp(a + (b - a) * (frame - index), 0, 1);
}

export interface WeightedState {
  key: SceneStateKey;
  weight: number;
}

function blendTransform(states: WeightedState[], id: string): SceneTransform {
  const result = {} as SceneTransform;
  if (states.every(({ key }) => key.objects[id].color !== undefined))
    result.color = blendSceneColors(
      states.map(({ key, weight }) => ({
        color: key.objects[id].color!,
        weight,
      })),
    );
  if (states.some(({ key }) => key.objects[id].presence !== undefined))
    result.presence = states.reduce(
      (sum, { key, weight }) => sum + (key.objects[id].presence ?? 1) * weight,
      0,
    );
  for (const property of [
    "x",
    "y",
    "z",
    "scale",
    "scaleX",
    "scaleY",
    "scaleZ",
  ] as const)
    result[property] = states.reduce(
      (sum, { key, weight }) => sum + (key.objects[id][property] ?? 1) * weight,
      0,
    );
  // Circular means preserve shortest-angle seams without accumulating rotation.
  // Exactly opposed angles use the first strongest route as a stable tie-break.
  const strongest = states.reduce((a, b) => (b.weight > a.weight ? b : a));
  for (const property of ["rotation", "rotationX", "rotationZ"] as const) {
    const x = states.reduce(
      (sum, { key, weight }) =>
        sum + Math.cos(key.objects[id][property] ?? 0) * weight,
      0,
    );
    const y = states.reduce(
      (sum, { key, weight }) =>
        sum + Math.sin(key.objects[id][property] ?? 0) * weight,
      0,
    );
    result[property] =
      Math.hypot(x, y) < 1e-12
        ? (strongest.key.objects[id][property] ?? 0)
        : Math.atan2(y, x);
  }
  return result;
}

export function blendedTarget(
  motion: SceneMotion,
  states: WeightedState[],
): SceneStateKey {
  if (states.length === 1) return states[0].key;
  const strongest = states.reduce((a, b) => (b.weight > a.weight ? b : a));
  const controls = { ...SCENE_CONTROL_DEFAULTS };
  for (const property of Object.keys(controls) as (keyof SceneControls)[])
    controls[property] = states.reduce(
      (sum, { key, weight }) =>
        sum +
        (key.controls?.[property] ?? SCENE_CONTROL_DEFAULTS[property]) * weight,
      0,
    );
  const room = motion.room;
  const roomVector = (
    property: "dimensions" | "source" | "listener",
  ): SceneVector =>
    [0, 1, 2].map((axis) =>
      states.reduce(
        (sum, { key, weight }) =>
          sum + (key.room?.[property] ?? room![property])[axis] * weight,
        0,
      ),
    ) as SceneVector;
  return {
    ...strongest.key,
    objects: Object.fromEntries(
      Object.keys(strongest.key.objects).map((id) => [
        id,
        blendTransform(states, id),
      ]),
    ),
    controls,
    ...(room
      ? {
          room: {
            dimensions: roomVector("dimensions"),
            source: roomVector("source"),
            listener: roomVector("listener"),
          },
        }
      : {}),
  };
}

/** Lightweight axis snapshot for meters; frame is on the bounded scene clock. */
export function morphControlPosition(
  recipe: Recipe,
  frame: number,
  audio = true,
): EvaluatedMorphControl | undefined {
  if (!Number.isFinite(frame)) throw new Error("Scene frame must be finite.");
  const motion = recipe.motion,
    control = motion?.morphControl;
  if (!motion || !control?.enabled) return undefined;
  const { progress, target } = control;
  const baseline =
    progress.mode === "timeline"
      ? frame / Math.max(1, recipe.frames - 1)
      : progress.position;
  const amount = clamp(
    baseline +
      (audio
        ? signal(recipe, progress.source, frame) *
          progress.amount *
          motion.intensity
        : 0),
    0,
    1,
  );
  const position = target.position * (target.routes.length - 1);
  const low = Math.floor(position),
    high = Math.ceil(position);
  const manual = target.routes.map((_, index) =>
    low === high
      ? Number(index === low)
      : index === low
        ? high - position
        : index === high
          ? position - low
          : 0,
  );
  const energies = target.routes.map((route) =>
    audio && route.enabled
      ? signal(recipe, route.source, frame) * route.amount
      : 0,
  );
  const total = energies.reduce((sum, value) => sum + value, 0);
  const strength = clamp(total * target.amount * motion.intensity, 0, 1);
  const strongest = energies.reduce(
    (best, value, index) => (value > energies[best] ? index : best),
    0,
  );
  const weights = target.routes.map((route, index) => ({
    stateId: route.stateId,
    weight:
      manual[index] * (1 - strength) +
      (total > 0
        ? strength *
          (target.mode === "strongest"
            ? Number(index === strongest)
            : energies[index] / total)
        : 0),
  }));
  const dominant = weights.reduce((a, b) => (b.weight > a.weight ? b : a));
  return {
    progress: amount,
    targetPosition:
      weights.reduce((sum, { weight }, index) => sum + weight * index, 0) /
      Math.max(1, weights.length - 1),
    dominantStateId: dominant.stateId,
    weights,
  };
}

/** Exact-time evaluation of the two axes; absent signals are silent, not inferred. */
export function evaluateMorphControl(
  recipe: Recipe,
  frame: number,
  audio: boolean,
) {
  const metadata = morphControlPosition(recipe, frame, audio);
  if (!metadata) return undefined;
  const motion = recipe.motion!;
  const keys = new Map(motion.stateKeys.map((key) => [key.id, key]));
  const active = metadata.weights
    .filter(({ weight }) => weight > 0)
    .map(({ stateId, weight }) => ({ key: keys.get(stateId)!, weight }));
  return {
    from: keys.get(motion.morphControl!.originStateId)!,
    to: blendedTarget(motion, active),
    progress: metadata.progress,
    metadata,
  };
}
