import type { Recipe } from "./recipe";
import { CAMERA_POSITION_LIMIT } from "./scene-bounds";
import type { SceneVector } from "./scene-state";
import { MOD_SOURCES, type ModSource } from "./mod-routes";
import { cameraPoseAtKeys, linkedCameraPose } from "./scene-camera-blend";
import { legacyCameraAt, legacyCameraTargetAt } from "./legacy-camera";
import type { AvatarKey } from "./avatar-path";
import {
  rotationAt,
  rotateAround,
  validateSceneRotation,
  type SceneRotation,
} from "./scene-rotation";

export interface SceneCameraKey {
  id: string;
  frame: number;
  position: SceneVector;
  target: SceneVector;
  fov: number;
  easing: "linear" | "easeInOut";
}
export interface SceneCameraMotion {
  version: 1;
  enabled: boolean;
  /** Omitted/keys uses saved views; legacy preserves the analytic named move. */
  base?: "keys" | "legacy";
  /** When states blend, blend their saved camera endpoints with the same weights. */
  followMorph?: boolean;
  orbit?: SceneRotation;
  keys: SceneCameraKey[];
  audio: {
    enabled: boolean;
    source: ModSource;
    amount: number;
    motion?: "push" | "lift";
  };
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const number = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const vector = (v: unknown): v is SceneVector =>
  Array.isArray(v) &&
  v.length === 3 &&
  v.every((n) => number(n, -CAMERA_POSITION_LIMIT, CAMERA_POSITION_LIMIT));
const only = (v: Record<string, unknown>, names: string[]) =>
  Object.keys(v).every((key) => names.includes(key));

/** A saved camera path is data, with the same bounded frame clock as the scene. */
export function validateSceneCamera(
  input: unknown,
  frames: number,
): SceneCameraMotion {
  if (
    !object(input) ||
    !only(input, [
      "version",
      "enabled",
      "base",
      "keys",
      "audio",
      "followMorph",
      "orbit",
    ]) ||
    input.version !== 1 ||
    typeof input.enabled !== "boolean" ||
    (input.base !== undefined &&
      input.base !== "keys" &&
      input.base !== "legacy") ||
    (input.followMorph !== undefined &&
      typeof input.followMorph !== "boolean") ||
    !Array.isArray(input.keys) ||
    !input.keys.length ||
    input.keys.length > 16
  )
    throw new Error("Invalid scene camera path.");
  if (input.orbit !== undefined) validateSceneRotation(input.orbit);
  let previous = -1;
  const ids = new Set<string>();
  for (const key of input.keys) {
    if (
      !object(key) ||
      !only(key, ["id", "frame", "position", "target", "fov", "easing"]) ||
      typeof key.id !== "string" ||
      !/^[\w-]{1,48}$/.test(key.id) ||
      ids.has(key.id) ||
      !number(key.frame, 0, frames - 1) ||
      !Number.isInteger(key.frame) ||
      key.frame <= previous ||
      !vector(key.position) ||
      !vector(key.target) ||
      !number(key.fov, 15, 100) ||
      !["linear", "easeInOut"].includes(String(key.easing)) ||
      Math.hypot(
        ...key.position.map((v, i) => v - (key.target as SceneVector)[i]),
      ) < 0.1
    )
      throw new Error(
        "Camera keys need distinct frames, finite positions and a separate look target.",
      );
    ids.add(key.id);
    previous = key.frame;
  }
  if (input.keys[0].frame !== 0)
    throw new Error("The camera path must start at frame zero.");
  const audio = input.audio;
  if (
    !object(audio) ||
    !only(audio, ["enabled", "source", "amount", "motion"]) ||
    typeof audio.enabled !== "boolean" ||
    !MOD_SOURCES.includes(audio.source as ModSource) ||
    (audio.motion !== undefined &&
      audio.motion !== "push" &&
      audio.motion !== "lift") ||
    !number(audio.amount, 0, 1)
  )
    throw new Error("Invalid camera audio response.");
  return structuredClone(input) as unknown as SceneCameraMotion;
}

/** Exact-time interpolation. No live analyser, frame history or random state. */
export function sceneCameraAt(recipe: Recipe, inputFrame: number) {
  const motion = recipe.cameraMotion;
  if (!motion?.enabled) return undefined;
  const frame = recipe.loop
    ? ((inputFrame % recipe.frames) + recipe.frames) % recipe.frames
    : Math.max(0, Math.min(recipe.frames - 1, inputFrame));
  const { position, target, fov } =
    motion.base === "legacy"
      ? {
          position: [...legacyCameraAt(recipe, frame)] as SceneVector,
          target: [...legacyCameraTargetAt(recipe, frame)] as SceneVector,
          fov: recipe.fov,
        }
      : linkedCameraPose(recipe, frame, cameraPoseAtKeys(motion.keys, frame));
  const orbit = rotationAt(motion.orbit, frame, recipe.frames, recipe.loop);
  if (orbit) {
    const moved = rotateAround(position, target, orbit);
    position.splice(0, 3, ...moved);
  }
  // A bounded push or rise follows the prepared envelope; zero is neutral.
  const data =
    motion.audio.source === "level"
      ? recipe.envelope
      : (recipe.bandEnvelopes[motion.audio.source] ?? []);
  if (motion.audio.enabled) {
    const pulse = (data[Math.floor(frame)] ?? 0) * motion.audio.amount;
    if (motion.audio.motion === "lift") position[1] += pulse;
    else {
      const distance = Math.hypot(...position.map((v, i) => v - target[i]));
      const amount = Math.min(pulse, distance * 0.2);
      position.forEach((v, i) => {
        position[i] += ((target[i] - v) / Math.max(distance, 0.1)) * amount;
      });
    }
  }
  if (Math.hypot(...position.map((v, i) => v - target[i])) < 0.1)
    position[2] += 0.1;
  return { position, target, fov };
}

export function reverseSceneTravel(recipe: Recipe): Partial<Recipe> {
  if (recipe.cameraMotion?.enabled && recipe.cameraMotion.base === "legacy")
    throw new Error(
      "Choose saved camera views before reversing scene and camera keys; a named camera move is analytic.",
    );
  const lastFrame = recipe.frames - 1;
  if (
    (recipe.motion && recipe.motion.stateKeys.at(-1)?.frame !== lastFrame) ||
    (recipe.cameraMotion &&
      recipe.cameraMotion.keys.at(-1)?.frame !== lastFrame)
  )
    throw new Error(
      "Move the final scene and camera keys to the end of the take before reversing travel.",
    );
  if (recipe.avatarPath?.some((key) => key.ease === "fall"))
    throw new Error(
      "Use linear character movement before reversing travel; fall easing cannot be reversed exactly.",
    );
  if (recipe.avatarPath && recipe.avatarPath.at(-1)?.frame !== lastFrame)
    throw new Error(
      "Move the final character key to the end of the take before reversing travel.",
    );
  const characterKeys: AvatarKey[] | undefined = recipe.avatarPath
    ? [{ frame: 0, pose: recipe.avatarPose }, ...recipe.avatarPath]
    : undefined;
  const character = characterKeys
    ?.map((key, index) => ({
      frame: lastFrame - key.frame,
      pose: structuredClone(key.pose),
      ...(characterKeys[index + 1]?.ease
        ? { ease: characterKeys[index + 1].ease }
        : {}),
    }))
    .reverse();
  const reverse = <T extends { frame: number; easing: "linear" | "easeInOut" }>(
    keys: T[],
  ) =>
    keys
      .map((key, index) => ({
        ...structuredClone(key),
        frame: recipe.frames - 1 - key.frame,
        easing: keys[Math.max(0, index - 1)].easing,
      }))
      .reverse();
  return {
    ...(character
      ? {
          avatarPose: character[0].pose,
          avatarPath: character.slice(1),
        }
      : {}),
    ...(recipe.motion
      ? {
          motion: {
            ...recipe.motion,
            stateKeys: reverse(recipe.motion.stateKeys),
          },
        }
      : {}),
    ...(recipe.cameraMotion
      ? {
          cameraMotion: {
            ...recipe.cameraMotion,
            keys: reverse(recipe.cameraMotion.keys),
          },
        }
      : {}),
  };
}
