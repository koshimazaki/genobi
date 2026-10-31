import { validateRecipe, type Recipe } from "./recipe";
import { evaluateScene } from "./evaluate-scene";
import {
  sceneObjects,
  sceneTransformOf,
  type SceneTransform,
} from "./scene-state";
import { snapshotCamera } from "./scene-snapshot-camera";
import { avatarPoseAt } from "./avatar-path";
import { validateSceneCamera } from "./scene-camera";
import { TAKE_FRAMES } from "./take-duration";
import type {
  SceneLoopAudio,
  SceneLoopCaptureOptions,
  SceneLoopSnapshot,
} from "./scene-loop-types";

const plain = (input: unknown): input is Record<string, unknown> =>
  !!input && typeof input === "object" && !Array.isArray(input);
const fields = (
  input: unknown,
  allowed: string[],
): input is Record<string, unknown> =>
  plain(input) && Object.keys(input).every((key) => allowed.includes(key));
export const emptyLoopAudio = () => ({
  envelope: [],
  bandEnvelopes: { sub: [], low: [], mid: [], high: [] },
});
export function loopAudioData(audio?: SceneLoopAudio) {
  return audio
    ? structuredClone({
        envelope: audio.envelope,
        bandEnvelopes: audio.bandEnvelopes,
      })
    : emptyLoopAudio();
}

function compact(part: SceneTransform): SceneTransform {
  return Object.fromEntries(
    Object.entries(part).filter(
      ([key, value]) =>
        value !== undefined &&
        !(key.startsWith("rotation") && value === 0) &&
        !(key !== "scale" && key.startsWith("scale") && value === 1) &&
        !(key === "presence" && value === 1),
    ),
  ) as SceneTransform;
}

/** Freeze authored geometry and camera, never a transient audio envelope. */
export function captureLoopSnapshot(
  input: Recipe,
  frame: number,
  options: SceneLoopCaptureOptions,
): SceneLoopSnapshot {
  const source = validateRecipe(input);
  if (!Number.isFinite(frame) || frame < 0 || frame > source.frames - 1)
    throw new Error(
      "Choose a frame inside the current take before saving a loop slot.",
    );
  if (source.scene === "neuro")
    throw new Error(
      "Loop slots capture authored geometry. Choose a Stage or Playground scene instead of a shader scene.",
    );
  const label = options.label ?? "Saved scene";
  if (typeof label !== "string" || !label.trim() || label.length > 80)
    throw new Error("Use a loop-slot label from 1 to 80 characters.");
  const evaluated = evaluateScene(source, frame, {
    audio: false,
    editing: options.editing,
  });
  const base = new Map(sceneObjects(source).map((part) => [part.id, part]));
  const objects = Object.fromEntries(
    evaluated.objects
      .filter((part) => base.has(part.id))
      .map((part) => {
        const transform = sceneTransformOf(part);
        for (const axis of ["rotation", "rotationX", "rotationZ"] as const) {
          const value = transform[axis];
          if (value !== undefined && (value > Math.PI || value < -Math.PI))
            transform[axis] = Math.atan2(Math.sin(value), Math.cos(value));
        }
        if (part.color !== base.get(part.id)!.color)
          transform.color = part.color;
        return [part.id, compact(transform)];
      }),
  );
  const camera = options.camera
    ? structuredClone(options.camera)
    : snapshotCamera(source, frame, options);
  const recipe = validateRecipe({
    ...source,
    ...emptyLoopAudio(),
    audioRoutes: [],
    characterAudio: undefined,
    loop: false,
    orbit: 0,
    dolly: 0,
    elevationEnd: null,
    cameraShot: "custom",
    objects: source.objects.map((part) => ({ ...part, spin: 0, orbit: 0 })),
    avatarPose: options.editing
      ? source.avatarPose
      : avatarPoseAt(source, frame),
    avatarPath: undefined,
    motion: {
      version: 1,
      pivot: source.motion?.pivot ?? [
        source.targetX,
        source.targetY,
        source.targetZ,
      ],
      intensity: 1,
      mappings: [],
      ...(source.motion?.instances
        ? { instances: source.motion.instances }
        : {}),
      ...(evaluated.room ? { room: evaluated.room } : {}),
      stateKeys: [
        {
          id: "snapshot",
          label: label.trim(),
          frame: 0,
          easing: "easeInOut",
          objects,
        },
      ],
    },
    cameraMotion: {
      version: 1,
      enabled: true,
      keys: [
        { id: "snapshot-camera", frame: 0, easing: "easeInOut", ...camera },
      ],
      audio: { enabled: false, source: "sub", amount: 0.2, motion: "push" },
    },
  });
  return {
    version: 1,
    label: label.trim(),
    sourceFrame: frame,
    recipe,
    camera,
  };
}

/** Strict data-only snapshots are safe to keep independently of current scene loads. */
export function validateLoopSnapshot(input: unknown): SceneLoopSnapshot {
  if (
    !fields(input, ["version", "label", "sourceFrame", "recipe", "camera"]) ||
    input.version !== 1 ||
    typeof input.label !== "string" ||
    !input.label.trim() ||
    input.label.length > 80 ||
    typeof input.sourceFrame !== "number" ||
    !Number.isFinite(input.sourceFrame) ||
    input.sourceFrame < 0 ||
    input.sourceFrame > TAKE_FRAMES.max - 1 ||
    !fields(input.camera, ["position", "target", "fov"])
  )
    throw new Error("Invalid saved loop snapshot.");
  const recipe = validateRecipe(input.recipe);
  if (
    recipe.scene === "neuro" ||
    recipe.motion?.stateKeys.length !== 1 ||
    recipe.cameraMotion?.keys.length !== 1 ||
    recipe.cameraMotion.enabled !== true ||
    recipe.cameraMotion.base === "legacy" ||
    recipe.cameraMotion.audio.enabled ||
    recipe.cameraMotion.orbit !== undefined ||
    recipe.motion.rotation !== undefined ||
    recipe.motion.mappings.length ||
    recipe.motion.morphControl !== undefined ||
    recipe.motion.stateAudio !== undefined ||
    recipe.characterAudio !== undefined ||
    recipe.avatarPath !== undefined ||
    recipe.objects.some((part) => part.spin !== 0 || (part.orbit ?? 0) !== 0) ||
    recipe.envelope.length ||
    Object.values(recipe.bandEnvelopes).some((values) => values.length) ||
    recipe.audioRoutes.length
  )
    throw new Error(
      "Loop snapshots need one saved arrangement and camera, without soundtrack data.",
    );
  validateSceneCamera(
    {
      version: 1,
      enabled: true,
      keys: [{ id: "saved", frame: 0, easing: "easeInOut", ...input.camera }],
      audio: { enabled: false, source: "sub", amount: 0, motion: "push" },
    },
    recipe.frames,
  );
  const saved = recipe.cameraMotion.keys[0];
  if (
    JSON.stringify([saved.position, saved.target, saved.fov]) !==
    JSON.stringify([
      input.camera.position,
      input.camera.target,
      input.camera.fov,
    ])
  )
    throw new Error("The loop snapshot camera must match its recalled view.");
  return structuredClone({ ...input, recipe }) as unknown as SceneLoopSnapshot;
}
