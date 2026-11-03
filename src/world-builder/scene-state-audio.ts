import type { Recipe } from "./recipe";
import { MOD_SOURCES, type ModSource } from "./mod-routes";
import type { SceneMotion, SceneStateKey } from "./scene-state";
import { blendedTarget } from "./scene-morph-evaluation";
import { transitionTransform } from "./scene-transition";

export interface SceneStateAudio {
  version: 1;
  enabled: boolean;
  amount: number;
  routes: {
    stateId: string;
    source: ModSource;
    amount: number;
    enabled: boolean;
  }[];
}

export interface StateAudioWeights {
  strength: number;
  weights: { stateId: string; weight: number }[];
}

export function defaultStateAudio(motion: SceneMotion): SceneStateAudio {
  const sources: ModSource[] = ["low", "mid", "high", "sub", "level"];
  return {
    version: 1,
    enabled: false,
    amount: 0.65,
    routes: motion.stateKeys.map((key, index) => ({
      stateId: key.id,
      source: sources[index % sources.length],
      amount: 1,
      enabled: true,
    })),
  };
}

const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const fields = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  plain(v) && Object.keys(v).every((key) => keys.includes(key));
const finite = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;

export function validateStateAudio(input: unknown, ids: Set<string>) {
  if (
    !fields(input, ["version", "enabled", "amount", "routes"]) ||
    input.version !== 1 ||
    typeof input.enabled !== "boolean" ||
    !finite(input.amount, 1) ||
    !Array.isArray(input.routes) ||
    input.routes.length > ids.size
  )
    throw new Error("Invalid scene state audio routing.");
  const used = new Set<string>();
  for (const route of input.routes) {
    if (
      !fields(route, ["stateId", "source", "amount", "enabled"]) ||
      typeof route.stateId !== "string" ||
      !ids.has(route.stateId) ||
      used.has(route.stateId) ||
      !MOD_SOURCES.includes(route.source as ModSource) ||
      !finite(route.amount, 2) ||
      typeof route.enabled !== "boolean"
    )
      throw new Error(
        "State audio routes need unique existing states and bounded bands.",
      );
    used.add(route.stateId);
  }
}

/** Current energy pulls toward states while the authored timeline continues. */
export function stateAudioWeights(
  recipe: Pick<Recipe, "motion" | "envelope" | "bandEnvelopes">,
  frame: number,
  audio = true,
): StateAudioWeights | undefined {
  const motion = recipe.motion,
    control = motion?.stateAudio;
  if (!control?.enabled || !audio || !motion) return undefined;
  const energies = control.routes.map((route) => {
    const data =
      route.source === "level"
        ? recipe.envelope
        : recipe.bandEnvelopes[route.source];
    const index = Math.floor(frame),
      fraction = frame - index;
    const a = data?.[index] ?? 0,
      b = data?.[index + 1] ?? a;
    return route.enabled
      ? Math.max(0, Math.min(1, a + (b - a) * fraction)) * route.amount
      : 0;
  });
  const total = energies.reduce((sum, value) => sum + value, 0);
  const strength = Math.max(
    0,
    Math.min(1, total * control.amount * motion.intensity),
  );
  if (!strength || !total) return undefined;
  return {
    strength,
    weights: control.routes.map((route, index) => ({
      stateId: route.stateId,
      weight: energies[index] / total,
    })),
  };
}

export interface SceneKeyPair {
  from: SceneStateKey;
  to: SceneStateKey;
  progress: number;
}

export function timelineStatePair(
  keys: SceneStateKey[],
  frame: number,
): SceneKeyPair {
  let index = 0;
  while (index + 1 < keys.length && keys[index + 1].frame <= frame) index++;
  const from = keys[index],
    to = keys[Math.min(index + 1, keys.length - 1)];
  const raw =
    from === to
      ? 0
      : Math.max(
          0,
          Math.min(1, (frame - from.frame) / (to.frame - from.frame)),
        );
  return {
    from,
    to,
    progress: from.easing === "easeInOut" ? raw * raw * (3 - 2 * raw) : raw,
  };
}

export function evaluateStateAudio(
  recipe: Recipe,
  frame: number,
  pair: SceneKeyPair,
  audio: boolean,
) {
  const metadata = stateAudioWeights(recipe, frame, audio);
  if (!metadata) return undefined;
  const motion = recipe.motion!;
  const from = blendedTarget(motion, [
    { key: pair.from, weight: 1 - pair.progress },
    { key: pair.to, weight: pair.progress },
  ]);
  // Preserve the selected movement algorithm in the timed baseline.
  const baseline = {
    ...from,
    objects: Object.fromEntries(
      Object.keys(pair.from.objects).map((id) => [
        id,
        transitionTransform(
          pair.from.objects[id],
          pair.to.objects[id],
          pair.progress,
          id,
          motion,
        ),
      ]),
    ),
  };
  const keys = new Map(motion.stateKeys.map((key) => [key.id, key]));
  const to = blendedTarget(
    motion,
    metadata.weights
      .filter((item) => item.weight > 0)
      .map((item) => ({ key: keys.get(item.stateId)!, weight: item.weight })),
  );
  return { from: baseline, to, progress: metadata.strength, metadata };
}
