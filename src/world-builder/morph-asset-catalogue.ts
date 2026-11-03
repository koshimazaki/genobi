import { createMotionPreset } from "./motion-presets";
import { defaultRecipe, type Recipe } from "./recipe";
import type { SceneMotion, SceneTransform } from "./scene-state";
import { compactLayouts, matchLayout } from "./motion-layout-utils";
import { normalizeMorphParts, resampleMorphParts } from "./morph-resample";
import { frameMorphComposition } from "./morph-framing";
import { defaultMorphControl } from "./scene-morph-control";
import { defaultStateAudio } from "./scene-state-audio";
import {
  framesForSeconds,
  MOVE_SECONDS,
  reconcileDuration,
} from "./take-duration";
import { validateMorphRecipe } from "./morph-budget";

/** These are individual authored forms, distinct from a complete motion preset. */
export const MORPH_ASSETS = [
  {
    id: "pyramid",
    name: "Pyramid",
    family: "Architecture",
    preset: "voxel-architecture",
    state: 0,
  },
  {
    id: "chamber",
    name: "Chamber",
    family: "Architecture",
    preset: "voxel-architecture",
    state: 1,
  },
  {
    id: "cathedral",
    name: "Cathedral",
    family: "Architecture",
    preset: "voxel-architecture",
    state: 2,
  },
  {
    id: "banana",
    name: "Banana",
    family: "Fruit",
    preset: "fruit-morph",
    state: 0,
  },
  {
    id: "papaya",
    name: "Papaya",
    family: "Fruit",
    preset: "fruit-morph",
    state: 1,
  },
  {
    id: "apple",
    name: "Apple",
    family: "Fruit",
    preset: "fruit-morph",
    state: 2,
  },
  {
    id: "orange",
    name: "Orange",
    family: "Fruit",
    preset: "fruit-audio-branches",
    state: 3,
  },
  {
    id: "watermelon",
    name: "Watermelon",
    family: "Fruit",
    preset: "fruit-audio-branches",
    state: 4,
  },
  {
    id: "spacecraft",
    name: "Spacecraft",
    family: "Machines",
    preset: "spacecraft-mecha",
    state: 0,
  },
  {
    id: "mecha",
    name: "Mecha",
    family: "Machines",
    preset: "spacecraft-mecha",
    state: 1,
  },
  {
    id: "winged-mecha",
    name: "Winged mecha",
    family: "Machines",
    preset: "spacecraft-mecha",
    state: 2,
  },
  {
    id: "mask",
    name: "Mask",
    family: "Sculpture",
    preset: "mask-morph",
    state: 0,
  },
  {
    id: "crown",
    name: "Crown",
    family: "Sculpture",
    preset: "mask-morph",
    state: 1,
  },
  {
    id: "palms",
    name: "Palms",
    family: "Sculpture",
    preset: "palm-grove",
    state: 0,
  },
] as const;

export interface MorphCompositionOptions {
  assetIds: string[];
  count: 64 | 128 | 256;
  style: NonNullable<SceneMotion["transitionStyle"]>;
  durationSeconds?: number;
}

const sourceCache = new Map<string, SceneTransform[]>();
const compositionCache = new Map<string, Recipe>();
function assetLayout(id: string, count: MorphCompositionOptions["count"]) {
  const asset = MORPH_ASSETS.find((entry) => entry.id === id);
  if (!asset) throw new Error("Choose a form from the morph library.");
  const cacheKey = `${id}:${count}`;
  const cached = sourceCache.get(cacheKey);
  if (cached) return structuredClone(cached);
  let preset: string = asset.preset;
  if (preset === "voxel-architecture" && count !== 64) preset += `-${count}`;
  if (preset === "fruit-morph" && count === 256) preset = "fruit-morph-fine";
  const recipe = createMotionPreset(preset);
  const layout = Object.values(recipe.motion!.stateKeys[asset.state].objects);
  const normalized = normalizeMorphParts(resampleMorphParts(layout, count));
  sourceCache.set(cacheKey, normalized);
  return structuredClone(normalized);
}

/** Two to four forms, one retained part set, explicit path and editable keys. */
export function createMorphComposition(
  options: MorphCompositionOptions,
): Recipe {
  if (
    !options ||
    !Array.isArray(options.assetIds) ||
    options.assetIds.length < 2 ||
    options.assetIds.length > 4 ||
    new Set(options.assetIds).size !== options.assetIds.length
  )
    throw new Error("Choose two to four different forms in order.");
  if (![64, 128, 256].includes(options.count))
    throw new Error("Choose 64, 128 or 256 blocks.");
  if (!["direct", "scatter", "twist", "assemble"].includes(options.style))
    throw new Error("Choose a supported transition style.");
  const duration = options.durationSeconds ?? 8;
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < MOVE_SECONDS.min ||
    duration > MOVE_SECONDS.max
  )
    throw new Error(
      `Choose a total duration from ${MOVE_SECONDS.min} to ${MOVE_SECONDS.max.toFixed(2)} seconds.`,
    );
  const retime = (template: Recipe) =>
    validateMorphRecipe(
      reconcileDuration(template, { ...template, seconds: duration }),
    );
  const cacheKey = JSON.stringify([
    options.assetIds,
    options.count,
    options.style,
  ]);
  const cached = compositionCache.get(cacheKey);
  if (cached) return retime(structuredClone(cached));
  const layouts: SceneTransform[][] = [];
  for (const id of options.assetIds) {
    const layout = assetLayout(id, options.count);
    layouts.push(
      layouts.length ? matchLayout(layouts.at(-1)!, layout) : layout,
    );
  }
  const compact = compactLayouts(layouts);
  const labels = options.assetIds.map(
    (id) => MORPH_ASSETS.find((a) => a.id === id)!.name,
  );
  // Geometry and normalized transition paths do not depend on the duration fader.
  const frames = framesForSeconds(8);
  const recipe = validateMorphRecipe(
    {
      ...structuredClone(defaultRecipe),
      scene: "stage",
      stageLook: "dark-grid",
      background: "#080b12",
      avatar: false,
      screen: false,
      objects: [],
      audioRoutes: [],
      frames,
      seconds: 8,
      radius: 21,
      azimuth: 30,
      elevation: 22,
      targetY: 3,
      orbit: 0,
      dolly: 0,
      fov: 48,
      light: 2.4,
      cameraShot: "custom",
      prompt: `${labels.join(" → ")}. Authored forms matched into ${options.count} retained blocks with ${options.style} transition paths. Coarse detail approximates the source forms.`,
      motion: {
        version: 1,
        pivot: [0, 3, 0],
        intensity: 1,
        instances: {
          generator: "voxel-lattice",
          version: 1,
          seed: 173,
          count: options.count,
          columns: 4,
          spacing: 0.8,
          size: 0.72,
          palette: ["#ccd4dc", "#adb9c7", "#7eaeb9", "#d2c6a8"],
        },
        transitionStyle: options.style,
        stateKeys: compact.map((layout, index) => ({
          id: `form-${index + 1}`,
          label: labels[index],
          frame: Math.round((index * (frames - 1)) / (compact.length - 1)),
          easing: "easeInOut",
          objects: Object.fromEntries(
            layout.map((part, i) => [
              `voxel-${String(i).padStart(3, "0")}`,
              part,
            ]),
          ),
        })),
        mappings: [],
      },
    },
    false,
  );
  recipe.motion!.morphControl = defaultMorphControl(recipe.motion!);
  recipe.motion!.stateAudio = defaultStateAudio(recipe.motion!);
  const framed = frameMorphComposition(recipe);
  if (compositionCache.size >= 12)
    compositionCache.delete(compositionCache.keys().next().value!);
  compositionCache.set(cacheKey, structuredClone(framed));
  return retime(framed);
}
