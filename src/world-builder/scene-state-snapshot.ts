import { validateRecipe, type Recipe } from "./recipe";
import { evaluateScene } from "./evaluate-scene";
import {
  SCENE_CONTROL_DEFAULTS,
  sceneObjects,
  sceneTransformOf,
  type SceneMotion,
  type SceneTransform,
  type SceneStateKey,
} from "./scene-state";
import { defaultMorphControl } from "./scene-morph-control";
import { defaultStateAudio } from "./scene-state-audio";
import {
  snapshotCamera,
  snapshotCameraMotion,
  type SnapshotCamera,
} from "./scene-snapshot-camera";
import { validateMorphRecipe } from "./morph-budget";

export interface SceneStateCaptureOptions {
  /** Omit to append A, B, C or D; legacy longer sequences remain replaceable. */
  targetStateId?: string;
  label?: string;
  camera?: SnapshotCamera;
  viewportPatch?: Partial<Recipe>;
  /** Build shows raw authored transforms; Shot includes the chosen transition path. */
  editing?: boolean;
}

function compact(transform: SceneTransform): SceneTransform {
  return Object.fromEntries(
    Object.entries(transform).filter(
      ([key, value]) =>
        value !== undefined &&
        !(key.startsWith("rotation") && value === 0) &&
        !(key !== "scale" && key.startsWith("scale") && value === 1),
    ),
  ) as SceneTransform;
}

function captureArrangement(recipe: Recipe, frame: number, editing: boolean) {
  const baseline = evaluateScene(recipe, frame, { audio: false, editing });
  const raw: Recipe = {
    ...recipe,
    objects: recipe.objects.map((part) => ({ ...part, spin: 0, orbit: 0 })),
    ...(recipe.motion
      ? {
          motion: {
            ...recipe.motion,
            rotation: undefined,
            stateKeys: recipe.motion.stateKeys.map((key) => ({
              ...key,
              controls: undefined,
            })),
          },
        }
      : {}),
  };
  const evaluated = evaluateScene(raw, frame, { audio: false, editing });
  const retained = new Set(sceneObjects(recipe).map((part) => part.id));
  const objects = Object.fromEntries(
    evaluated.objects
      .filter((part) => retained.has(part.id))
      .map((part) => [
        part.id,
        compact({
          ...sceneTransformOf(part),
          ...(recipe.motion?.stateKeys.some(
            (key) => key.objects[part.id]?.color !== undefined,
          )
            ? { color: part.color }
            : {}),
        }),
      ]),
  );
  const controls = Object.fromEntries(
    Object.entries(baseline.controls).filter(
      ([key, value]) =>
        value !==
        SCENE_CONTROL_DEFAULTS[key as keyof typeof SCENE_CONTROL_DEFAULTS],
    ),
  );
  return {
    objects,
    ...(Object.keys(controls).length ? { controls } : {}),
    ...(baseline.room
      ? {
          room: {
            dimensions: baseline.room.dimensions,
            source: baseline.room.source,
            listener: baseline.room.listener,
          },
        }
      : {}),
  };
}

/**
 * Atomic authored-state save, preserving the existing object identities.
 * Audio, constant prop spin/orbit and authored controls are not baked twice.
 */
export function captureSceneState(
  input: Recipe,
  frame: number,
  options: SceneStateCaptureOptions = {},
): Recipe {
  const recipe = validateRecipe(input);
  if (!Number.isFinite(frame) || frame < 0 || frame > recipe.frames - 1)
    throw new Error("Choose a frame inside the current take.");
  const oldStates = recipe.motion?.stateKeys ?? [];
  const append = options.targetStateId === undefined;
  const selected = append
    ? oldStates.length
    : oldStates.findIndex((key) => key.id === options.targetStateId);
  if (selected < 0) throw new Error("Choose an existing state to replace.");
  if (append && oldStates.length >= 4)
    throw new Error(
      "A sequence can append up to four states (A–D). Choose an existing state to replace.",
    );
  const label =
    options.label ??
    (append
      ? `State ${String.fromCharCode(65 + selected)}`
      : oldStates[selected].label);
  if (typeof label !== "string" || !label.trim() || label.length > 80)
    throw new Error("Use a state label from 1 to 80 characters.");
  let suffix = oldStates.length + 1;
  while (oldStates.some((key) => key.id === `state-${suffix}`)) suffix++;
  const id = append ? `state-${suffix}` : oldStates[selected].id;
  const saved: SceneStateKey = {
    id,
    label: label.trim(),
    frame: append ? recipe.frames - 1 : oldStates[selected].frame,
    easing: append ? "easeInOut" : oldStates[selected].easing,
    ...captureArrangement(recipe, frame, options.editing === true),
  };
  // Authored primitives omitted from old keys were constant; seed them uniformly.
  const retained = sceneObjects(recipe);
  let states = oldStates.map((key) => ({
    ...key,
    objects: Object.fromEntries(
      retained.map((part) => [
        part.id,
        key.objects[part.id] ?? compact(sceneTransformOf(part)),
      ]),
    ),
  }));
  if (append) states.push(saved);
  else states[selected] = saved;
  if (append)
    states = states.map((key, index) => ({
      ...key,
      frame:
        states.length === 1
          ? 0
          : Math.round((index * (recipe.frames - 1)) / (states.length - 1)),
    }));
  const motion: SceneMotion = recipe.motion
    ? { ...recipe.motion, stateKeys: states }
    : {
        version: 1,
        pivot: [recipe.targetX, recipe.targetY, recipe.targetZ],
        intensity: 1,
        mappings: [],
        stateKeys: states,
      };
  if (!motion.stateAudio) motion.stateAudio = defaultStateAudio(motion);
  else if (append) {
    const route = defaultStateAudio(motion).routes.find(
      (route) => route.stateId === id,
    )!;
    motion.stateAudio = {
      ...motion.stateAudio,
      routes: [...motion.stateAudio.routes, { ...route, enabled: false }],
    };
  }
  if (!motion.morphControl && states.length > 1)
    motion.morphControl = defaultMorphControl(motion);
  else if (append && motion.morphControl) {
    const route = defaultMorphControl(motion).target.routes.find(
      (route) => route.stateId === id,
    )!;
    const target = motion.morphControl.target;
    motion.morphControl = {
      ...motion.morphControl,
      target: {
        ...target,
        position:
          (target.position * (target.routes.length - 1)) / target.routes.length,
        routes: [...target.routes, { ...route, enabled: false }],
      },
    };
  }
  const destination = states[selected];
  const cameraMotion = snapshotCameraMotion(
    recipe,
    oldStates,
    states,
    destination,
    snapshotCamera(recipe, frame, options),
    append,
  );
  return validateMorphRecipe({ ...recipe, motion, cameraMotion });
}
