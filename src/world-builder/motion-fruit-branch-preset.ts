import type { Recipe } from "./recipe";
import type { SceneMotion } from "./scene-state";
import { defaultMorphControl } from "./scene-morph-control";
import { fruitBranchLayouts } from "./motion-fruit-layouts";
import { compactLayouts } from "./motion-layout-utils";

export const FRUIT_BRANCH_STATES = [
  "banana",
  "papaya",
  "apple",
  "orange",
  "watermelon",
] as const;

export function fruitBranchPresetPatch(): Partial<Recipe> {
  const motion: SceneMotion = {
    version: 1,
    pivot: [0, 2.15, 0],
    instances: {
      generator: "voxel-lattice",
      version: 1,
      seed: 173,
      count: 96,
      columns: 4,
      spacing: 0.8,
      size: 0.36,
      palette: ["#ffd66b", "#cfe46d", "#ff9f5b", "#a6d38b"],
    },
    stateKeys: compactLayouts(fruitBranchLayouts()).map((layout, index) => ({
      id: `fruit-${FRUIT_BRANCH_STATES[index]}`,
      label:
        FRUIT_BRANCH_STATES[index][0].toUpperCase() +
        FRUIT_BRANCH_STATES[index].slice(1),
      frame: index * 48,
      easing: "easeInOut",
      objects: Object.fromEntries(
        layout.map((part, i) => [`voxel-${String(i).padStart(3, "0")}`, part]),
      ),
    })),
    // The routing demonstration keeps silhouette changes separate from twists.
    mappings: [],
    intensity: 1,
    transitionStyle: "direct",
  };
  motion.morphControl = defaultMorphControl(motion);
  motion.morphControl.target.routes = [
    { stateId: "fruit-papaya", source: "sub", amount: 1, enabled: false },
    { stateId: "fruit-apple", source: "low", amount: 1, enabled: true },
    { stateId: "fruit-orange", source: "mid", amount: 1, enabled: true },
    { stateId: "fruit-watermelon", source: "high", amount: 1, enabled: true },
  ];
  return {
    motion,
    stageLook: "dark-grid",
    background: "#080b12",
    frames: 193,
    seconds: 8,
    radius: 9.5,
    fov: 42,
    azimuth: 12,
    elevation: 13,
    targetY: 2.3,
    prompt:
      "Five authored fruit shapes share 96 retained blocks. Enable the two-axis morph controller to separate transformation progress from target choice. Loudness advances the transformation; bass pulls toward apple, mids toward orange and highs toward watermelon. The target axis also selects papaya manually. These are measured energy bands, not drum or instrument recognition.",
  };
}
