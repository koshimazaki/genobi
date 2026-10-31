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
import { fruitLayouts } from "./motion-voxel-layouts";
import { fruitBranchPresetPatch } from "./motion-fruit-branch-preset";
import { architecturePresetPatch } from "./motion-architecture-preset";
import { cityLoftLayouts } from "./motion-city-layouts";
import {
  spacecraftLayouts,
  maskLayouts,
  palmGroveLayouts,
} from "./motion-object-layouts";

export const MOTION_PRESETS = [
  {
    id: "city-to-loft",
    name: "Travel · City / loft",
    summary: "Skyline → street canyon → open loft · 96 transforming parts",
    acoustic: "Visual architecture only; no outdoor acoustic simulation.",
  },
  {
    id: "neo-tokyo-to-loft",
    name: "Travel · Neo Tokyo / loft",
    summary: "Night skyline → neon street → open loft · camera travel",
    acoustic: "Original geometric interpretation; no real city reconstruction.",
  },
  {
    id: "voxel-architecture",
    name: "Morph · Architecture · 64",
    summary: "Pyramid → house / chamber → cathedral · 64 retained blocks",
    acoustic: "No acoustic enclosure. Add a room to explore reverb.",
  },
  {
    id: "voxel-architecture-128",
    name: "Morph · Architecture · 128",
    summary: "Pyramid → house / chamber → cathedral · 128 retained blocks",
    acoustic: "Visual architecture with stable parts; no inferred acoustics.",
  },
  {
    id: "voxel-architecture-256",
    name: "Morph · Architecture · 256",
    summary: "Pyramid → house / chamber → cathedral · 256 retained blocks",
    acoustic: "Highest bounded detail; visual geometry only.",
  },
  {
    id: "spacecraft-mecha",
    name: "Morph · Spacecraft / mecha",
    summary: "Spacecraft → mecha → winged mecha · 128 retained parts",
    acoustic: "Authored modular forms, ready for audio-driven transformation.",
  },
  {
    id: "mask-morph",
    name: "Morph · Mask / crown",
    summary: "Mask → crown → open mask · 96 retained parts",
    acoustic: "Geometric masks with independently editable morph and twist.",
  },
  {
    id: "palm-grove",
    name: "Motion · Palm grove",
    summary: "Upright → sway → spread · 96 retained parts",
    acoustic:
      "A sculptural palm study; audio can push the sway and separation.",
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
  {
    id: "fruit-morph-fine",
    name: "Morph · Fine fruit",
    summary: "Banana → papaya → apple · 192 smaller voxels",
    acoustic:
      "Twice the voxels with a comparable silhouette and editable states.",
  },
  {
    id: "fruit-audio-branches",
    name: "Morph · Fruit / audio branches",
    summary:
      "Five fruit shapes · independent progress and spectral target axes",
    acoustic:
      "Bass → apple · mids → orange · highs → watermelon; energy-band routing.",
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
  if (id === "fruit-audio-branches") return fruitBranchPresetPatch();
  if (
    id === "voxel-architecture" ||
    id === "voxel-architecture-128" ||
    id === "voxel-architecture-256"
  )
    return architecturePresetPatch(
      id === "voxel-architecture-256"
        ? 256
        : id === "voxel-architecture-128"
          ? 128
          : 64,
    );
  if (id === "city-to-loft" || id === "neo-tokyo-to-loft") {
    const neon = id === "neo-tokyo-to-loft";
    const motion = voxels(
      96,
      neon
        ? ["#93b9b2", "#c46d8e", "#84c9ce", "#c5b288"]
        : ["#d4c4a4", "#98abb0", "#b3baab", "#d9d3c2"],
      ["Skyline", "Street canyon", "Open loft"],
      cityLoftLayouts(),
    );
    motion.stateKeys.forEach((key, i) => {
      key.frame = [0, 96, 192][i];
    });
    motion.mappings = [
      mapping("lift", "low", 0.22),
      mapping("spread", "high", 0.025),
      mapping("morph", "level", 0.025),
    ];
    motion.intensity = 0.5;
    return {
      motion,
      frames: 193,
      seconds: 8,
      radius: 24,
      targetY: 3,
      orbit: 0,
      background: neon ? "#090b14" : "#080b12",
      fov: 48,
      cameraMotion: {
        version: 1,
        enabled: true,
        keys: [
          {
            id: "camera-skyline",
            frame: 0,
            position: [25, 21, 31],
            target: [0, 4, 0],
            fov: 48,
            easing: "easeInOut",
          },
          {
            id: "camera-street",
            frame: 96,
            position: [0, 4.2, 21],
            target: [0, 2.7, -1],
            fov: 54,
            easing: "easeInOut",
          },
          {
            id: "camera-loft",
            frame: 192,
            position: [0, 2.5, 5.5],
            target: [0, 2, -3.5],
            fov: 68,
            easing: "easeInOut",
          },
        ],
        audio: { enabled: false, source: "sub", amount: 0.2, motion: "push" },
      },
      prompt:
        "Travel from an original geometric city skyline down a street canyon into an open loft. The same 96 architectural parts become floor tiles, beams, windows and furniture. Camera position, look target and lens move on the same timeline. Keep the transition readable; audio adds restrained height and separation offsets.",
    };
  }
  if (id === "spacecraft-mecha" || id === "mask-morph" || id === "palm-grove") {
    const ship = id === "spacecraft-mecha",
      palm = id === "palm-grove";
    const motion = voxels(
      ship ? 128 : 96,
      ship
        ? ["#b7c9c9", "#829b9c", "#dfcaa5", "#ca8870"]
        : palm
          ? ["#91ac8a", "#6e8e72", "#c3ad7e", "#b7c591"]
          : ["#d6be96", "#b09577", "#82aaa6", "#d9ceac"],
      ship
        ? ["Spacecraft", "Mecha", "Winged mecha"]
        : palm
          ? ["Upright", "Sway", "Spread"]
          : ["Mask", "Crown", "Open mask"],
      ship ? spacecraftLayouts() : palm ? palmGroveLayouts() : maskLayouts(),
    );
    motion.mappings = [
      mapping("twistY", "low", palm ? 0.12 : 0.25),
      mapping("spread", "high", palm ? 0.04 : 0.1),
      mapping("morph", "sub", 0.12),
    ];
    return {
      motion,
      radius: ship ? 15 : palm ? 16 : 11,
      fov: 46,
      azimuth: ship ? 22 : palm ? 28 : 12,
      elevation: ship ? 18 : palm ? 18 : 8,
      targetY: ship ? 2.4 : palm ? 2.2 : 2.6,
      background: "#080b12",
      prompt: ship
        ? "Original modular spacecraft transforms into a standing mecha, then opens its wings. The same 128 parts retain their identities. Prepared sub-bass gently advances the morph; bass turns the group and highs open the spacing."
        : palm
          ? "Three geometric palm forms sway and open their fronds. Keep 96 stable parts, with a gentle audio-responsive sway and separation."
          : "An original geometric mask transforms into a crown, then an open mask. Keep 96 stable pieces and use restrained audio-responsive morphing and twist.",
    };
  }
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
  const detail = id === "fruit-morph-fine" ? 192 : 96;
  return {
    radius: 9.1,
    fov: 40,
    azimuth: 12,
    elevation: 13,
    targetY: 2.35,
    motion: voxels(
      detail,
      ["#e7cb72", "#d5ba65", "#c6c77d", "#b1c17d"],
      ["Banana", "Papaya", "Apple"],
      fruitLayouts(detail),
    ),
    prompt: `A voxel banana becomes a tall papaya and then a rounded apple. Keep the same ${detail} blocks. Bass twists vertical layers, mids twist horizontal layers, high frequencies separate cells and level gently offsets the morph.`,
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
    stageLook: "dark-grid",
    background: "#080b12",
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
