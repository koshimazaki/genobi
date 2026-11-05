import type { SceneMapping, SceneMotion, SceneTransform } from "./scene-state";

/** Shared builders for the voxel motion presets. */
const frames = [0, 72, 144];
export const mapping = (
  property: SceneMapping["property"],
  source: SceneMapping["source"],
  amount: number,
): SceneMapping => ({
  id: `motion-${property}`,
  property,
  source,
  amount,
  enabled: true,
});

export function keys(
  labels: string[],
  layouts: SceneTransform[][],
  ids?: string[],
) {
  return layouts.map((layout, i) => ({
    id: `state-${i + 1}`,
    label: labels[i],
    frame: frames[i],
    easing: "easeInOut" as const,
    objects: Object.fromEntries(
      layout.map((t, n) => [
        ids?.[n] ?? `voxel-${String(n).padStart(3, "0")}`,
        t,
      ]),
    ),
  }));
}

export function voxels(
  count: number,
  palette: string[],
  labels: string[],
  layouts: SceneTransform[][],
): SceneMotion {
  return {
    version: 1,
    pivot: [0, 2.2, 0],
    instances: {
      generator: "voxel-lattice",
      version: 1,
      seed: 173,
      count,
      columns: 4,
      spacing: 0.8,
      size: 0.72,
      palette,
    },
    stateKeys: keys(labels, layouts),
    mappings: [
      mapping("twistY", "low", 0.85),
      mapping("twistX", "mid", 0.55),
      mapping("spread", "high", 0.18),
      mapping("morph", "level", 0.08),
    ],
    intensity: 0.65,
  };
}
