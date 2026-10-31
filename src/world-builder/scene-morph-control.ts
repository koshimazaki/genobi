import type { ModSource } from "./mod-routes";
import type { SceneMotion, SceneStateKey } from "./scene-state";

export interface SceneMorphRoute {
  stateId: string;
  source: ModSource;
  amount: number;
  /** Disables the audio route; the target remains on the manual axis. */
  enabled: boolean;
}

/** Two independent axes. Audio offsets their chosen baseline, never the clock. */
export interface SceneMorphControl {
  version: 1;
  enabled: boolean;
  originStateId: string;
  progress: {
    mode: "manual" | "timeline";
    position: number;
    source: ModSource;
    amount: number;
  };
  target: {
    /** Ordered target stops span 0..1; adjacent manual stops blend linearly. */
    position: number;
    amount: number;
    mode: "blend" | "strongest";
    routes: SceneMorphRoute[];
  };
}

export interface EvaluatedMorphControl {
  progress: number;
  /** Weighted centre of the target stops; weights retain the complete mixture. */
  targetPosition: number;
  dominantStateId: string;
  weights: { stateId: string; weight: number }[];
}

/** Fresh, initially inactive controls over the scene's existing retained IDs. */
export function defaultMorphControl(motion: SceneMotion): SceneMorphControl {
  if (motion.stateKeys.length < 2)
    throw new Error(
      "Morph routing needs an origin and at least one target state.",
    );
  const sources: ModSource[] = ["low", "mid", "high", "sub", "level"];
  return {
    version: 1,
    enabled: false,
    originStateId: motion.stateKeys[0].id,
    progress: { mode: "manual", position: 0, source: "level", amount: 1 },
    target: {
      position: 0,
      amount: 1,
      mode: "blend",
      routes: motion.stateKeys.slice(1).map((key, index) => ({
        stateId: key.id,
        source: sources[index % sources.length],
        amount: 1,
        enabled: true,
      })),
    },
  };
}

/** Removing a referenced key must not leave an invalid saved controller. */
export function pruneMorphControl(
  motion: SceneMotion,
  nextStateKeys: SceneStateKey[],
): SceneMorphControl | undefined {
  const control = motion.morphControl;
  if (!control) return undefined;
  const ids = new Set(nextStateKeys.map((key) => key.id));
  if (!ids.has(control.originStateId)) return undefined;
  const routes = control.target.routes.filter((route) =>
    ids.has(route.stateId),
  );
  return routes.length
    ? { ...control, target: { ...control.target, routes } }
    : undefined;
}
