import { validateRecipe, type Recipe } from "./recipe";
import {
  framesForSeconds,
  MOVE_SECONDS,
  reconcileDuration,
} from "./take-duration";
import { validateMorphRecipe } from "./morph-budget";
import { defaultStateAudio, validateStateAudio } from "./scene-state-audio";
import { assertLoopCompatibility, loopParts } from "./scene-loop-parts";
import { loopAudioData } from "./scene-loop-snapshot";
import { validateSceneLoopBank } from "./scene-loop-bank";
import {
  SCENE_LOOP_SLOTS,
  type SceneLoopBank,
  type SceneLoopOptions,
} from "./scene-loop-types";
import type { SceneCameraMotion } from "./scene-camera";
import type { SceneMotion } from "./scene-state";
import { validateRoutes, type ModRoute } from "./mod-routes";

function retainedAudioRoutes(
  input: ModRoute[] | undefined,
  recipe: Recipe,
  stableIds: Set<string>,
) {
  if (input !== undefined && !Array.isArray(input))
    throw new Error("Invalid loop audio routes.");
  const known = (input ?? []).flatMap((route) =>
    typeof route?.target === "string" && route.target.startsWith("prop:")
      ? [route.target.slice(5)]
      : [],
  );
  return validateRoutes(input ?? [], known).filter((route) => {
    if (route.target.startsWith("prop:"))
      return stableIds.has(route.target.slice(5));
    if (route.target === "avatar") return recipe.avatar;
    if (route.target === "world" || route.target.startsWith("world:"))
      return recipe.scene === "playground";
    return route.target !== "neuro";
  });
}

function cameraOverride(
  recipe: Recipe,
  options: SceneLoopOptions,
  frames: number,
  seconds: number,
) {
  const paired = recipe.cameraMotion!;
  if (options.camera) {
    const source = validateRecipe(options.camera);
    const timed = reconcileDuration(source, {
      ...source,
      seconds,
      frames,
    }) as Recipe;
    for (const field of [
      "fov",
      "radius",
      "azimuth",
      "elevation",
      "targetX",
      "targetY",
      "targetZ",
      "orbit",
      "dolly",
      "elevationEnd",
      "cameraShot",
      "cameraCurve",
      "cameraMotion",
    ] as const)
      Object.assign(recipe, { [field]: timed[field] });
  }
  if (options.cameraOrbit || options.cameraAudio) {
    const active =
      (options.cameraOrbit?.turns ?? 0) !== 0 ||
      options.cameraAudio?.enabled === true;
    if (!recipe.cameraMotion?.enabled && !active) return;
    const path = recipe.cameraMotion?.enabled
      ? recipe.cameraMotion
      : {
          ...(recipe.cameraMotion ?? paired),
          enabled: true,
          base: "legacy" as const,
          followMorph: false,
        };
    recipe.cameraMotion = {
      ...path,
      ...(options.cameraOrbit ? { orbit: options.cameraOrbit } : {}),
      ...(options.cameraAudio ? { audio: options.cameraAudio } : {}),
    };
  }
}

/** Compose independent scene slots; the normal capture path records the resulting recipe. */
export function composeSceneLoop(
  input: SceneLoopBank,
  options: SceneLoopOptions = {},
): Recipe {
  const bank = validateSceneLoopBank(input);
  const selected = bank.slots.flatMap((slot, index) =>
    slot ? [{ slot, index }] : [],
  );
  if (selected.length < 2)
    throw new Error(
      "Save at least two loop slots, A–D, before playing the loop.",
    );
  const slots = selected.map(({ slot }) => slot);
  assertLoopCompatibility(slots);
  const duration = options.durationSeconds ?? 8;
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < MOVE_SECONDS.min ||
    duration > MOVE_SECONDS.max
  )
    throw new Error(
      `Choose a loop duration from ${MOVE_SECONDS.min} to ${MOVE_SECONDS.max.toFixed(2)} seconds.`,
    );
  const style = options.style ?? "direct";
  if (!["direct", "scatter", "twist", "assemble"].includes(style))
    throw new Error("Choose a supported loop movement.");
  if (
    slots[0].recipe.motion?.acousticZones &&
    (style !== "direct" || (options.rotation && options.rotation.turns !== 0))
  )
    throw new Error(
      "Use Direct with no object rotation for a loop with fixed acoustic zones. Camera moves remain available; Save scene keeps the complete story.",
    );
  if (
    options.returnToStart !== undefined &&
    typeof options.returnToStart !== "boolean"
  )
    throw new Error("Choose whether the loop returns to A.");
  const returns = options.returnToStart !== false;
  const frames = framesForSeconds(duration);
  const parts = loopParts(slots);
  const sequence = [...selected, ...(returns ? [selected[0]] : [])];
  const stateKeys = sequence.map(({ slot, index }, position) => ({
    id:
      position < selected.length
        ? `loop-${SCENE_LOOP_SLOTS[index]}`
        : `loop-return-${SCENE_LOOP_SLOTS[index]}`,
    label:
      position < selected.length
        ? slot.label
        : `Return to ${SCENE_LOOP_SLOTS[index]}`,
    frame: Math.round((position * (frames - 1)) / (sequence.length - 1)),
    easing: "easeInOut" as const,
    objects: parts.states[position < selected.length ? position : 0],
    ...(slot.recipe.motion?.room
      ? {
          room: {
            dimensions: slot.recipe.motion.room.dimensions,
            source: slot.recipe.motion.room.source,
            listener: slot.recipe.motion.room.listener,
          },
        }
      : {}),
  }));
  const first = slots[0].recipe;
  const motion: SceneMotion = {
    version: 1,
    pivot: first.motion!.pivot,
    intensity: 1,
    mappings: [],
    stateKeys,
    transitionStyle: style,
    ...(parts.instances ? { instances: parts.instances } : {}),
    ...(first.motion?.room ? { room: first.motion.room } : {}),
    ...(first.motion?.acousticZones
      ? {
          acousticZones: first.motion.acousticZones,
          acousticListener: first.motion.acousticListener ?? "camera",
        }
      : {}),
    ...(options.rotation ? { rotation: options.rotation } : {}),
  };
  const defaults = defaultStateAudio({
    ...motion,
    stateKeys: stateKeys.slice(0, selected.length),
  });
  if (options.stateAudio) {
    if (!Array.isArray(options.stateAudio.routes))
      throw new Error("Invalid loop audio routes.");
    validateStateAudio(
      options.stateAudio,
      new Set(options.stateAudio.routes.map((route) => route.stateId)),
    );
    const routes = new Map(
      options.stateAudio.routes.map((route) => [route.stateId, route]),
    );
    motion.stateAudio = {
      ...options.stateAudio,
      routes: defaults.routes.map(
        (route) => routes.get(route.stateId) ?? { ...route, enabled: false },
      ),
    };
  } else motion.stateAudio = defaults;
  const cameraMotion: SceneCameraMotion = {
    version: 1,
    enabled: true,
    followMorph: true,
    keys: sequence.map(({ slot }, index) => ({
      id: `camera-${stateKeys[index].id}`,
      frame: stateKeys[index].frame,
      easing: "easeInOut",
      ...slot.camera,
    })),
    audio: { enabled: false, source: "sub", amount: 0.2, motion: "push" },
  };
  const recipe: Recipe = {
    ...structuredClone(first),
    ...loopAudioData(options.audio),
    audioRoutes: retainedAudioRoutes(
      options.audioRoutes,
      first,
      parts.stablePrimitiveIds,
    ),
    ...(options.characterAudio
      ? { characterAudio: options.characterAudio }
      : {}),
    frames,
    seconds: duration,
    loop: returns,
    objects: parts.objects,
    motion,
    cameraMotion,
    avatarPath: first.avatar
      ? sequence.slice(1).map(({ slot }, index) => ({
          frame: stateKeys[index + 1].frame,
          pose: slot.recipe.avatarPose,
        }))
      : undefined,
    prompt: `${selected.map(({ slot, index }) => `${SCENE_LOOP_SLOTS[index]}: ${slot.label}`).join(" → ")}${returns ? ` → ${SCENE_LOOP_SLOTS[selected[0].index]}` : ""}. Saved scene loop; ${style} retained-part paths. Different primitives rebuild; authored voxel boxes are split and matched, with saved colors and cameras. The first saved slot sets the shared stage, background, floor, light and backdrop.`,
  };
  cameraOverride(recipe, options, frames, duration);
  return validateMorphRecipe(recipe);
}
