import type { Recipe } from "./recipe";
import {
  cameraPoseAtKeys,
  linkedCameraPose,
  type SceneCameraPose,
} from "./scene-camera-blend";
import type { SceneVector } from "./scene-state";
import { rotateAround, rotationAt } from "./scene-rotation";

/** Undo only the camera response that will be applied again when replayed. */
function authoredPose(recipe: Recipe, frame: number, view: SceneCameraPose) {
  const pose = structuredClone(view),
    path = recipe.cameraMotion!;
  if (path.audio.enabled) {
    const values =
      path.audio.source === "level"
        ? recipe.envelope
        : recipe.bandEnvelopes[path.audio.source];
    const pulse = (values?.[Math.floor(frame)] ?? 0) * path.audio.amount;
    if (path.audio.motion === "lift") pose.position[1] -= pulse;
    else {
      const distance = Math.hypot(
        ...pose.position.map((value, axis) => value - pose.target[axis]),
      );
      // Forward push is min(pulse, 20% of the original distance).
      const before = distance >= pulse * 4 ? distance + pulse : distance / 0.8;
      pose.position = pose.position.map(
        (value, axis) =>
          pose.target[axis] +
          ((value - pose.target[axis]) * before) / Math.max(distance, 0.1),
      ) as SceneVector;
    }
  }
  const orbit = rotationAt(path.orbit, frame, recipe.frames, recipe.loop);
  if (orbit)
    pose.position = rotateAround(pose.position, pose.target, orbit.invert());
  return pose;
}

/**
 * Commit a dragged Shot view without clamping it into the legacy orbit fields.
 * Camera interpolation is affine. Probe its existing weights so timed keys,
 * manual morph controls and state-audio pulls share exactly the same solver.
 * The strongest contributing key is normally the nearest key, and avoids
 * amplifying an edit through a nearly zero weight under audio state pulls.
 */
export function shotCameraPatch(
  recipe: Recipe,
  frame: number,
  view: SceneCameraPose,
): Partial<Recipe> {
  const path = recipe.cameraMotion;
  if (!path?.enabled || path.base === "legacy")
    return {
      cameraShot: "custom",
      cameraMotion: {
        version: 1,
        enabled: true,
        keys: [
          {
            id: "camera-view",
            frame: 0,
            easing: "easeInOut",
            ...structuredClone(view),
          },
        ],
        audio: { enabled: false, source: "sub", amount: 0.25, motion: "push" },
      },
    };
  const weights = path.keys.map((_, index) => {
    // These scalar basis values are evaluated only, never saved as lens values.
    const keys = path.keys.map((key, i) => ({
      ...key,
      fov: i === index ? 1 : 0,
    }));
    return linkedCameraPose(
      { ...recipe, cameraMotion: { ...path, keys } },
      frame,
      cameraPoseAtKeys(keys, frame),
    ).fov;
  });
  const index = weights.reduce(
      (best, weight, i) => (weight > weights[best] ? i : best),
      0,
    ),
    weight = weights[index],
    baseline = linkedCameraPose(
      recipe,
      frame,
      cameraPoseAtKeys(path.keys, frame),
    ),
    desired = authoredPose(recipe, frame, view);
  return {
    cameraShot: "custom",
    cameraMotion: {
      ...path,
      keys: path.keys.map((key, i) =>
        i !== index
          ? key
          : {
              ...key,
              position: key.position.map(
                (value, axis) =>
                  value +
                  (desired.position[axis] - baseline.position[axis]) / weight,
              ) as SceneVector,
              target: key.target.map(
                (value, axis) =>
                  value +
                  (desired.target[axis] - baseline.target[axis]) / weight,
              ) as SceneVector,
              fov: key.fov + (desired.fov - baseline.fov) / weight,
            },
      ),
    },
  };
}
