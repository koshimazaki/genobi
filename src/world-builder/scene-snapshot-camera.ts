import { cameraAt, cameraTargetAt, cameraFovAt, type Recipe } from "./recipe";
import type { SceneCameraKey, SceneCameraMotion } from "./scene-camera";
import type { SceneStateKey, SceneVector } from "./scene-state";

export interface SnapshotCamera {
  position: SceneVector;
  target: SceneVector;
  fov: number;
}

function mutedCameraRecipe(recipe: Recipe, independent = false): Recipe {
  return {
    ...recipe,
    envelope: [],
    bandEnvelopes: { sub: [], low: [], mid: [], high: [] },
    ...(recipe.cameraMotion
      ? {
          cameraMotion: {
            ...recipe.cameraMotion,
            ...(independent ? { followMorph: false } : {}),
            audio: { ...recipe.cameraMotion.audio, enabled: false },
          },
        }
      : {}),
  };
}

function pose(recipe: Recipe, frame: number): SnapshotCamera {
  return {
    position: [...cameraAt(recipe, frame)],
    target: [...cameraTargetAt(recipe, frame)],
    fov: cameraFovAt(recipe, frame),
  };
}

/** Exact viewport pose is preferred; the older bounded framing patch is supported. */
export function snapshotCamera(
  recipe: Recipe,
  frame: number,
  options: {
    camera?: SnapshotCamera;
    viewportPatch?: Partial<Recipe>;
    editing?: boolean;
  },
): SnapshotCamera {
  const muted = pose(mutedCameraRecipe(recipe), frame);
  let actual: SnapshotCamera | undefined = options.camera;
  if (!actual && options.viewportPatch) {
    const fields = [
      "radius",
      "azimuth",
      "elevation",
      "targetX",
      "targetY",
      "targetZ",
      "fov",
    ] as const;
    const patch = Object.fromEntries(
      fields
        .filter((name) => options.viewportPatch![name] !== undefined)
        .map((name) => [name, options.viewportPatch![name]]),
    );
    actual = pose(
      {
        ...recipe,
        ...patch,
        cameraShot: "custom",
        cameraMotion: undefined,
        orbit: 0,
        dolly: 0,
        elevationEnd: null,
      },
      0,
    );
  }
  if (!actual) return muted;
  if (options.editing) return structuredClone(actual);
  // Shot's known audio delta remains dynamic instead of being baked into a key.
  const live = pose(recipe, frame);
  return {
    position: actual.position.map(
      (v, i) => v - live.position[i] + muted.position[i],
    ) as SceneVector,
    target: actual.target.map(
      (v, i) => v - live.target[i] + muted.target[i],
    ) as SceneVector,
    fov: actual.fov - live.fov + muted.fov,
  };
}

/** Keep unrelated camera keys; appended states remap old key times together. */
export function snapshotCameraMotion(
  recipe: Recipe,
  oldStates: SceneStateKey[],
  states: SceneStateKey[],
  destination: SceneStateKey,
  captured: SnapshotCamera,
  append: boolean,
): SceneCameraMotion {
  const independent = mutedCameraRecipe(recipe, true);
  const keys = new Map<number, SceneCameraKey>();
  const used = new Set(recipe.cameraMotion?.keys.map((key) => key.id) ?? []);
  const id = () => {
    let index = 1;
    while (used.has(`saved-camera-${index}`)) index++;
    const value = `saved-camera-${index}`;
    used.add(value);
    return value;
  };
  const anchors = oldStates.map((key, index) => [
    key.frame,
    states[index].frame,
  ]);
  if (anchors.length && anchors.at(-1)![0] < recipe.frames - 1)
    anchors.push([recipe.frames - 1, recipe.frames - 1]);
  const remap = (frame: number) => {
    if (!append || anchors.length < 2) return frame;
    let index = 0;
    while (index + 1 < anchors.length && anchors[index + 1][0] <= frame)
      index++;
    const a = anchors[index],
      b = anchors[Math.min(index + 1, anchors.length - 1)];
    return Math.round(
      a === b ? a[1] : a[1] + ((b[1] - a[1]) * (frame - a[0])) / (b[0] - a[0]),
    );
  };
  for (const key of recipe.cameraMotion?.keys ?? [])
    keys.set(remap(key.frame), {
      ...structuredClone(key),
      frame: remap(key.frame),
      ...(recipe.cameraMotion?.orbit || recipe.cameraMotion?.base === "legacy"
        ? pose(independent, key.frame)
        : {}),
    });
  // Paired anchors retain their actual old camera, even when extra keys collapse.
  for (const [index, key] of oldStates.entries()) {
    const frame = states[index].frame;
    if (!append && keys.has(frame)) continue;
    keys.set(frame, {
      id: keys.get(frame)?.id ?? id(),
      frame,
      easing: key.easing,
      ...pose(independent, key.frame),
    });
  }
  keys.set(destination.frame, {
    id: keys.get(destination.frame)?.id ?? id(),
    frame: destination.frame,
    easing: destination.easing,
    ...structuredClone(captured),
  });
  if (!keys.has(0))
    keys.set(0, {
      id: id(),
      frame: 0,
      easing: "easeInOut",
      ...pose(independent, 0),
    });
  if (keys.size > 16)
    throw new Error("Use fewer camera keys before saving another state view.");
  return {
    version: 1,
    enabled: true,
    followMorph: true,
    keys: [...keys.values()].sort((a, b) => a.frame - b.frame),
    audio: structuredClone(
      recipe.cameraMotion?.audio ?? {
        enabled: false,
        source: "sub",
        amount: 0.2,
        motion: "push",
      },
    ),
  };
}
