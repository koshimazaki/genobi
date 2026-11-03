import { evaluateScene } from "./evaluate-scene";
import type { Recipe } from "./recipe";
import { partBounds } from "./morph-resample";
import { defaultMorphControl } from "./scene-morph-control";
import type { SceneVector } from "./scene-state";

/** Fit a common overview, including paths selected independently of scene time. */
export function frameMorphComposition(recipe: Recipe): Recipe {
  const azimuth = Math.PI / 6,
    elevation = (22 * Math.PI) / 180;
  const forward = [
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  ];
  const right = [Math.cos(azimuth), 0, -Math.sin(azimuth)];
  const up = [
    -Math.sin(elevation) * Math.sin(azimuth),
    Math.cos(elevation),
    -Math.sin(elevation) * Math.cos(azimuth),
  ];
  const parts = recipe.motion!.stateKeys.flatMap((key) =>
    Object.values(key.objects),
  );
  const { min, max } = partBounds(parts[0]);
  for (const part of parts.slice(1)) {
    const bounds = partBounds(part);
    min.min(bounds.min);
    max.max(bounds.max);
  }
  const target = min
    .add(max)
    .multiplyScalar(0.5)
    .toArray()
    .map((v) => Math.round(v * 1000) / 1000) as SceneVector;
  const tanY = Math.tan((46 * Math.PI) / 360) * 0.8;
  const tanX = (tanY * recipe.width) / recipe.height;
  let distance = 6;
  const fit = (input: Recipe, frame: number) => {
    for (const part of evaluateScene(input, frame, { audio: false }).objects) {
      const bounds = partBounds(part);
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const delta = [x - target[0], y - target[1], z - target[2]];
            const dot = (axis: number[]) =>
              delta.reduce((sum, value, i) => sum + value * axis[i], 0);
            distance = Math.max(
              distance,
              Math.abs(dot(right)) / tanX + dot(forward),
              Math.abs(dot(up)) / tanY + dot(forward),
            );
          }
    }
  };
  for (let frame = 0; frame < recipe.frames; frame++) fit(recipe, frame);
  // Every origin and the independent progress/target plane. A margin leaves
  // room between samples; authored timing alone cannot frame audio-selected forms.
  for (const origin of recipe.motion!.stateKeys) {
    const control = defaultMorphControl(recipe.motion!);
    control.enabled = true;
    control.originStateId = origin.id;
    control.target.routes = recipe
      .motion!.stateKeys.filter((key) => key.id !== origin.id)
      .map((key) => ({
        stateId: key.id,
        source: "level",
        amount: 0,
        enabled: false,
      }));
    control.target.amount = control.progress.amount = 0;
    const sample = {
      ...recipe,
      motion: { ...recipe.motion!, morphControl: control },
    };
    const targetSteps = control.target.routes.length > 1 ? 8 : 0;
    for (let to = 0; to <= targetSteps; to++) {
      control.target.position = targetSteps ? to / targetSteps : 0;
      for (let progress = 0; progress <= 16; progress++) {
        control.progress.position = progress / 16;
        fit(sample, 0);
      }
    }
  }
  distance = Math.ceil(distance * 100) / 100;
  const position = target.map(
    (v, i) => Math.round((v + forward[i] * distance) * 10000) / 10000,
  ) as SceneVector;
  return {
    ...recipe,
    radius: distance,
    targetX: target[0],
    targetY: target[1],
    targetZ: target[2],
    cameraMotion: {
      version: 1,
      enabled: true,
      keys: recipe.motion!.stateKeys.map((key) => ({
        id: `camera-${key.id}`,
        frame: key.frame,
        easing: key.easing,
        target: [...target],
        position: [...position],
        fov: 46,
      })),
      audio: { enabled: false, source: "sub", amount: 0.2, motion: "push" },
    },
  };
}
