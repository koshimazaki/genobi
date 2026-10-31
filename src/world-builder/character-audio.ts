import type { CharacterPose } from "../../shared/scene/characters";
import {
  BUILDER_CHARACTER_MODELS,
  type BuilderCharacterAsset,
} from "./character-catalog";
import { MOD_SOURCES, type ModSource } from "./mod-routes";
import { loopedMotionAt } from "./loop";
import { motionAt } from "./motion";
import type { Recipe } from "./recipe";
import { TAKE_FRAMES } from "./take-duration";

export interface CharacterAudioRoute {
  id: string;
  enabled: boolean;
  source: ModSource;
  clip: CharacterPose;
  threshold: number;
  cooldownFrames: number;
  durationFrames: number;
  speed: number;
}
export interface CharacterAudio {
  version: 1;
  enabled: boolean;
  routes: CharacterAudioRoute[];
}

export function defaultCharacterAudio(
  asset: BuilderCharacterAsset,
): CharacterAudio {
  const clips = BUILDER_CHARACTER_MODELS[asset]?.clips;
  if (!clips) throw new Error("Choose a known character first.");
  const clip = ["jump", "walk", "idle"].find((name) =>
    Object.hasOwn(clips, name),
  ) as CharacterPose;
  return {
    version: 1,
    enabled: false,
    routes: [
      {
        id: "character-band-1",
        enabled: true,
        source: "low",
        clip,
        threshold: 0.15,
        cooldownFrames: 12,
        durationFrames: 24,
        speed: 1,
      },
    ],
  };
}

const fields = (
  value: unknown,
  allowed: string[],
): value is Record<string, unknown> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.includes(key));
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

/** Named clips only: no URLs, code, arbitrary rigs or inferred drum classes. */
export function validateCharacterAudio(
  input: unknown,
  clips: object,
): CharacterAudio {
  if (
    !fields(input, ["version", "enabled", "routes"]) ||
    input.version !== 1 ||
    typeof input.enabled !== "boolean" ||
    !Array.isArray(input.routes) ||
    input.routes.length > 4
  )
    throw new Error("Use up to four prepared-audio character routes.");
  const ids = new Set<string>();
  for (const route of input.routes) {
    if (
      !fields(route, [
        "id",
        "enabled",
        "source",
        "clip",
        "threshold",
        "cooldownFrames",
        "durationFrames",
        "speed",
      ]) ||
      typeof route.id !== "string" ||
      !/^[a-zA-Z0-9][\w-]{0,47}$/.test(route.id) ||
      ids.has(route.id) ||
      typeof route.enabled !== "boolean" ||
      typeof route.source !== "string" ||
      !MOD_SOURCES.some((source) => source === route.source) ||
      typeof route.clip !== "string" ||
      !Object.hasOwn(clips, route.clip) ||
      !finite(route.threshold, 0.01, 1) ||
      !finite(route.cooldownFrames, 0, TAKE_FRAMES.max) ||
      !Number.isInteger(route.cooldownFrames) ||
      !finite(route.durationFrames, 1, TAKE_FRAMES.max) ||
      !Number.isInteger(route.durationFrames) ||
      !finite(route.speed, 0.25, 4)
    )
      throw new Error(
        "Character audio routes need unique IDs, known clips and bounded threshold, timing and speed.",
      );
    ids.add(route.id);
  }
  return structuredClone(input) as unknown as CharacterAudio;
}

/** Includes only active routes, so inactive local Creature slots need no attachment. */
export function characterAudioClips(
  recipe: Pick<Recipe, "characterAudio">,
): CharacterPose[] {
  return recipe.characterAudio?.enabled
    ? [
        ...new Set(
          recipe.characterAudio.routes
            .filter((route) => route.enabled)
            .map((route) => route.clip),
        ),
      ]
    : [];
}

export interface CharacterAudioEvent {
  routeId: string;
  clip: CharacterPose;
  startFrame: number;
  durationFrames: number;
  ageFrames: number;
  speed: number;
}

/** Latest accepted crossing wins; ties follow route order, with no playback history. */
export function characterAudioEventAt(
  recipe: Recipe,
  requestedFrame: number,
): CharacterAudioEvent | undefined {
  if (!Number.isFinite(requestedFrame))
    throw new Error("Character frame must be finite.");
  const control = recipe.characterAudio;
  if (!control?.enabled || !recipe.avatar || recipe.scene === "neuro")
    return undefined;
  const frame = recipe.loop
    ? ((requestedFrame % recipe.frames) + recipe.frames) % recipe.frames
    : Math.max(0, requestedFrame);
  const end = Math.min(recipe.frames - 1, Math.floor(frame));
  const previous = control.routes.map(() => -Infinity);
  const signals = control.routes.map((route) =>
    route.source === "level"
      ? recipe.envelope
      : (recipe.bandEnvelopes[route.source] ?? []),
  );
  let latest: { route: CharacterAudioRoute; frame: number } | undefined;
  for (let index = 0; index <= end; index++) {
    for (const [routeIndex, route] of control.routes.entries()) {
      if (!route.enabled) continue;
      const value = signals[routeIndex][index] ?? 0;
      const before = index ? (signals[routeIndex][index - 1] ?? 0) : 0;
      if (
        value < route.threshold ||
        before >= route.threshold ||
        index - previous[routeIndex] < route.cooldownFrames
      )
        continue;
      previous[routeIndex] = index;
      if (!latest || index > latest.frame) latest = { route, frame: index };
    }
  }
  if (!latest || frame - latest.frame >= latest.route.durationFrames)
    return undefined;
  return {
    routeId: latest.route.id,
    clip: latest.route.clip,
    startFrame: latest.frame,
    durationFrames: latest.route.durationFrames,
    ageFrames: frame - latest.frame,
    speed: latest.route.speed,
  };
}

/** Prepared soundtrack onsets override a bounded window, then resume authored motion. */
export function routedMotionAt(
  recipe: Recipe,
  frame: number,
  cycle: (clip: string) => number,
) {
  const event = characterAudioEventAt(recipe, frame);
  if (!event) return loopedMotionAt(recipe, frame, cycle);
  return motionAt(
    [{ clip: event.clip, seconds: event.durationFrames / recipe.fps }],
    event.ageFrames * event.speed,
    recipe.fps,
  );
}
