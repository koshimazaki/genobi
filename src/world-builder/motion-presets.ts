import { defaultRecipe, validateRecipe, type Recipe } from "./recipe";
import type {
  SceneMapping,
  SceneMotion,
  SceneRoom,
  SceneTransform,
} from "./scene-state";
import {
  apartmentLayouts,
  apartmentPieces,
  buildingLayouts,
} from "./motion-building-layouts";
import { fruitLayouts, voxelStructureLayouts } from "./motion-voxel-layouts";

export const MOTION_PRESETS = [
  {
    id: "voxel-architecture",
    name: "Morph · Pyramid / cube",
    summary: "Pyramid → cube → open structure · 64 retained blocks",
    acoustic: "No acoustic enclosure. Add a room to explore reverb.",
  },
  {
    id: "cathedral-street",
    name: "Morph · Cathedral / street",
    summary: "Cathedral → chambers → street · 64 architectural blocks",
    acoustic:
      "Single-room acoustic proxy; the chambers and street are visual studies.",
  },
  {
    id: "apartment-morph",
    name: "Morph · Apartment / loft",
    summary:
      "Compact → expanded → open loft · furniture and room stay editable",
    acoustic:
      "The enclosing room drives sound. The cutaway hides two guide surfaces.",
  },
  {
    id: "fruit-morph",
    name: "Morph · Banana / apple",
    summary: "Banana → papaya → apple · 96 retained voxels",
    acoustic:
      "No acoustic enclosure. Fruit shapes drive the visual guide only.",
  },
] as const;
export type MotionPresetId = (typeof MOTION_PRESETS)[number]["id"];

const frames = [0, 72, 144];
const mapping = (
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

function keys(labels: string[], layouts: SceneTransform[][], ids?: string[]) {
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

function room(
  id: string,
  dimensions: SceneRoom["dimensions"],
  visible: boolean,
): SceneRoom {
  return {
    id,
    dimensions,
    center: [0, 0, 0],
    source: [-0.8, 1.15, -0.4],
    listener: [0.8, 1.3, 0.5],
    absorption: {
      floor: 0.18,
      ceiling: 0.15,
      north: 0.12,
      south: 0.12,
      east: 0.12,
      west: 0.12,
    },
    seed: 271,
    wallThickness: 0.12,
    visible,
    ...(visible ? { cutaway: true } : {}),
  };
}

function voxels(
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

function presetPatch(id: MotionPresetId): Partial<Recipe> {
  if (id === "voxel-architecture")
    return {
      radius: 10.7,
      fov: 42,
      azimuth: 28,
      elevation: 22,
      targetY: 1.8,
      motion: voxels(
        64,
        ["#c7d3a5", "#b4c887", "#93a18b", "#d9dfc0"],
        ["Pyramid", "Cube", "Open structure"],
        voxelStructureLayouts(),
      ),
      prompt:
        "A modular voxel pyramid folds into a cube, then opens into a hollow structure. Keep all 64 block identities and the fixed camera. Low-band vertical twist, mid-band horizontal twist and high-band separation add bounded motion.",
    };
  if (id === "cathedral-street") {
    const motion = voxels(
      64,
      ["#c7c4b2", "#b6bea2", "#929d93", "#d5d7bb"],
      ["Cathedral", "Chambers", "Street"],
      buildingLayouts(),
    );
    motion.pivot = [0, 2.5, 0];
    motion.room = room("architecture-proxy", [6.5, 5.4, 8.5], false);
    motion.stateKeys.forEach((key, i) => {
      key.room = {
        dimensions: [
          [6.5, 5.4, 8.5],
          [9, 3.2, 9.2],
          [14, 4.8, 3.8],
        ][i] as [number, number, number],
      };
    });
    // Gentle amounts keep the architectural silhouette readable on music.
    motion.mappings = [
      mapping("lift", "low", 0.45),
      mapping("twistY", "mid", 0.22),
      mapping("spread", "high", 0.08),
      mapping("morph", "level", 0.05),
    ];
    return {
      radius: 17,
      fov: 42,
      azimuth: 22,
      elevation: 24,
      targetY: 2.1,
      motion,
      prompt:
        "An open Gothic-inspired nave rearranges into four chambers, then a single-sided street of eight buildings. This is a 64-block visual massing study. Sound uses the explicit single-room proxy, not a multi-room or outdoor acoustic simulation.",
    };
  }
  if (id === "apartment-morph") {
    const layouts = apartmentLayouts(),
      ids = apartmentPieces.map(([name]) => name);
    const motion: SceneMotion = {
      version: 1,
      pivot: [0, 1.5, 0],
      stateKeys: keys(["Compact", "Expanded", "Open loft"], layouts, ids),
      mappings: [
        mapping("roomWidth", "low", 0.35),
        mapping("roomHeight", "mid", 0.15),
        mapping("roomDepth", "high", 0.2),
        mapping("morph", "level", 0.05),
      ],
      intensity: 0.65,
      room: room("apartment", [5.6, 2.8, 4.5], true),
    };
    motion.stateKeys.forEach((key, i) => {
      key.room = {
        dimensions: [
          [5.6, 2.8, 4.5],
          [8, 3.4, 6.5],
          [10, 4.3, 8],
        ][i] as [number, number, number],
      };
    });
    return {
      radius: 15,
      fov: 46,
      azimuth: -22,
      elevation: 34,
      targetY: 1.2,
      objects: apartmentPieces.map(([id, color], i) => ({
        id,
        shape: "box",
        ...layouts[0][i],
        spin: 0,
        color,
        prompt:
          "Editable apartment furniture or partition; the explicit outer room controls acoustics.",
      })),
      motion,
      prompt:
        "A compact apartment expands and opens into a loft. The same partitions move into a kitchen island and shelving while the furniture retains its identity. Floor, walls and ceiling derive from one changing acoustic enclosure; the viewport uses a cutaway.",
    };
  }
  return {
    radius: 9.1,
    fov: 40,
    azimuth: 12,
    elevation: 13,
    targetY: 2.35,
    motion: voxels(
      96,
      ["#e7cb72", "#d5ba65", "#c6c77d", "#b1c17d"],
      ["Banana", "Papaya", "Apple"],
      fruitLayouts(),
    ),
    prompt:
      "A voxel banana becomes a tall papaya and then a rounded apple. Keep the same 96 blocks. Bass twists vertical layers, mids twist horizontal layers, high frequencies separate cells and level gently offsets the morph.",
  };
}

/** Every call returns a fresh, fully validated recipe, safe for editing. */
export function createMotionPreset(id: string): Recipe {
  if (!MOTION_PRESETS.some((preset) => preset.id === id))
    throw new Error("Unknown motion preset.");
  return validateRecipe({
    ...structuredClone(defaultRecipe),
    scene: "stage",
    avatar: false,
    screen: false,
    objects: [],
    audioRoutes: [],
    background: "#18231f",
    width: 1280,
    height: 704,
    seconds: 6,
    frames: 145,
    orbit: 0,
    dolly: 0,
    elevationEnd: null,
    cameraShot: "custom",
    light: 2.4,
    ...presetPatch(id as MotionPresetId),
  });
}

/** Compatible with the existing Scene Library rows and agent preset listing. */
export function motionPresets() {
  return MOTION_PRESETS.map(({ id, name, summary }) => ({
    id,
    name,
    source: "built-in" as const,
    file: id,
    summary,
    recipe: createMotionPreset(id),
  }));
}
