import type { Recipe } from "./recipe";
import type { SceneCameraKey } from "./scene-camera";
import type { SceneVector } from "./scene-state";
import { morphControlPosition } from "./scene-morph-evaluation";
import { stateAudioWeights } from "./scene-state-audio";

export interface SceneCameraPose {
  position: SceneVector;
  target: SceneVector;
  fov: number;
}

const mixPose = (
  a: SceneCameraPose,
  b: SceneCameraPose,
  t: number,
): SceneCameraPose => ({
  position: a.position.map(
    (v, i) => v + (b.position[i] - v) * t,
  ) as SceneVector,
  target: a.target.map((v, i) => v + (b.target[i] - v) * t) as SceneVector,
  fov: a.fov + (b.fov - a.fov) * t,
});

export function cameraPoseAtKeys(
  keys: SceneCameraKey[],
  frame: number,
): SceneCameraPose {
  const right = keys.findIndex((key) => key.frame > frame);
  const a = keys[right < 0 ? keys.length - 1 : Math.max(0, right - 1)];
  const b = keys[right < 0 ? keys.length - 1 : right];
  const raw =
    a === b
      ? 0
      : Math.max(0, Math.min(1, (frame - a.frame) / (b.frame - a.frame)));
  return mixPose(
    a,
    b,
    a.easing === "easeInOut" ? raw * raw * (3 - 2 * raw) : raw,
  );
}

/** Saved-state camera endpoints use the same spectral weights as their geometry. */
export function linkedCameraPose(
  recipe: Pick<
    Recipe,
    "cameraMotion" | "motion" | "frames" | "envelope" | "bandEnvelopes"
  >,
  frame: number,
  baseline: SceneCameraPose,
): SceneCameraPose {
  const path = recipe.cameraMotion,
    motion = recipe.motion;
  if (!path?.followMorph || !motion) return baseline;
  const pose = (stateId: string) => {
    const state = motion.stateKeys.find((key) => key.id === stateId);
    return state ? cameraPoseAtKeys(path.keys, state.frame) : baseline;
  };
  const weighted = (
    weights: { stateId: string; weight: number }[],
  ): SceneCameraPose => {
    const result: SceneCameraPose = {
      position: [0, 0, 0],
      target: [0, 0, 0],
      fov: 0,
    };
    for (const { stateId, weight } of weights) {
      const camera = pose(stateId);
      for (let axis = 0; axis < 3; axis++) {
        result.position[axis] += camera.position[axis] * weight;
        result.target[axis] += camera.target[axis] * weight;
      }
      result.fov += camera.fov * weight;
    }
    return result;
  };
  if (motion.stateAudio?.enabled) {
    const audio = stateAudioWeights(recipe, frame);
    return audio
      ? mixPose(baseline, weighted(audio.weights), audio.strength)
      : baseline;
  }
  // Only the fields consumed by the plane evaluator are needed here.
  const plane = morphControlPosition(recipe as Recipe, frame);
  return plane
    ? mixPose(
        pose(motion.morphControl!.originStateId),
        weighted(plane.weights),
        plane.progress,
      )
    : baseline;
}
