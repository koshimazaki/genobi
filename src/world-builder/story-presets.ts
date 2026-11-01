import { defaultRecipe, type Recipe } from "./recipe";
import type { SceneAcousticZone } from "./scene-acoustic-zones";
import type { SceneCameraKey, SceneCameraMotion } from "./scene-camera";
import type { SceneMotion } from "./scene-state";
import { validateMorphRecipe } from "./morph-budget";
import { compactLayouts } from "./motion-layout-utils";
import { avenueParts, descentParts } from "./story-descent-layout";
import { STORY_PALETTE, storyPoses, type StoryPart } from "./story-layouts";
import { descentFollowCameraKeys, withDescentView } from "./story-camera";

export const STORY_PRESETS = [
  {
    id: "endless-descent",
    name: "Story · Endless descent",
    summary: "16 s continuous fall · street → cathedral → club → DJ studio",
    acoustic:
      "Metre-based rooms with open-shaft acoustic estimates; one mannequin.",
  },
  {
    id: "bass-avenue",
    name: "Story · Bass avenue",
    summary: "8 s street loop · elastic towers, shuffling taxis and a dancer",
    acoustic: "Outdoor street is dry; measured bands pull authored poses.",
  },
] as const;
export type StoryPresetId = (typeof STORY_PRESETS)[number]["id"];

/** Apertures match the visible floor rings, with a separate local emitter per room. */
export function descentAcousticZones(): SceneAcousticZone[] {
  return [
    {
      id: "descent-street",
      label: "Open street · dry",
      kind: "outdoor",
      center: [0, 40, 0],
      dimensions: [64, 100, 64],
    },
    {
      id: "descent-cathedral",
      label: "Cathedral · open-shaft estimate",
      kind: "room",
      center: [0, 12, 0],
      dimensions: [24, 28, 36],
      absorption: {
        floor: 0.08,
        ceiling: 0.09,
        north: 0.07,
        south: 0.07,
        east: 0.07,
        west: 0.07,
      },
      source: [2, 1.5, -2],
      seed: 611,
      openings: [
        { face: "ceiling", areaM2: 240 },
        { face: "floor", areaM2: 96 },
        { face: "south", areaM2: 128 },
      ],
    },
    {
      id: "descent-club",
      label: "Basement club · open-shaft estimate",
      kind: "room",
      center: [0, 4, 0],
      dimensions: [16, 8, 20],
      absorption: {
        floor: 0.22,
        ceiling: 0.42,
        north: 0.35,
        south: 0.35,
        east: 0.3,
        west: 0.3,
      },
      source: [2, 1.5, -7],
      seed: 612,
      openings: [
        { face: "ceiling", areaM2: 96 },
        { face: "floor", areaM2: 24 },
        { face: "south", areaM2: 16 },
      ],
    },
    {
      id: "descent-studio",
      label: "DJ studio · open-shaft estimate",
      kind: "room",
      center: [0, 0, 0],
      dimensions: [8, 4, 10],
      absorption: {
        floor: 0.3,
        ceiling: 0.55,
        north: 0.5,
        south: 0.45,
        east: 0.5,
        west: 0.55,
      },
      source: [1, 1.2, -3.5],
      seed: 613,
      openings: [
        { face: "ceiling", areaM2: 24 },
        { face: "south", areaM2: 9.6 },
      ],
    },
  ];
}

function storyMotion(
  parts: StoryPart[],
  lastFrame: number,
  loop: boolean,
): SceneMotion {
  const layouts = compactLayouts(storyPoses(parts));
  const definitions = loop
    ? ([
        ["rest", "Street at rest", 0, 0],
        ["bass", "Bass · grounded towers", 64, 1],
        ["high", "Highs · taxi shuffle", 128, 2],
        ["return", "Return to street", lastFrame, 0],
      ] as const)
    : ([
        ["rest", "Street at rest", 0, 0],
        ["bass", "Bass · grounded towers", lastFrame / 2, 1],
        ["high", "Highs · taxi shuffle", lastFrame, 2],
      ] as const);
  return {
    version: 1,
    pivot: [0, 0, 0],
    instances: {
      version: 1,
      generator: "voxel-lattice",
      seed: 8061,
      count: parts.length,
      columns: 4,
      spacing: 1,
      size: 1,
      palette: [...STORY_PALETTE],
    },
    stateKeys: definitions.map(([id, label, frame, index]) => ({
      id: `story-${id}`,
      label,
      frame,
      easing: "easeInOut",
      objects: Object.fromEntries(
        layouts[index].map((part, i) => [
          `voxel-${String(i).padStart(3, "0")}`,
          { ...part },
        ]),
      ),
    })),
    mappings: [],
    intensity: 0.8,
    stateAudio: {
      version: 1,
      enabled: true,
      amount: 0.85,
      routes: [
        { stateId: "story-bass", source: "low", amount: 1, enabled: true },
        { stateId: "story-high", source: "high", amount: 1, enabled: true },
      ],
    },
  };
}

function cameraPath(keys: SceneCameraKey[]): SceneCameraMotion {
  return {
    version: 1,
    enabled: true,
    followMorph: false,
    keys,
    audio: { enabled: false, source: "sub", amount: 0.15, motion: "push" },
  };
}

function descentPatch(): Partial<Recipe> {
  const motion = storyMotion(descentParts(), 384, false);
  motion.acousticZones = descentAcousticZones();
  motion.acousticListener = "camera";
  return {
    frames: 385,
    seconds: 16,
    fov: 75,
    loop: false,
    avatarPose: { x: 0, y: 94, z: 0, yaw: 0 },
    avatarPath: [
      { frame: 192, pose: { x: 0, y: 36, z: 0, yaw: 0 } },
      { frame: 288, pose: { x: 0, y: 8, z: 0, yaw: 0 } },
      { frame: 336, pose: { x: 0, y: 0.8, z: 0, yaw: 0 } },
      { frame: 352, pose: { x: 0, y: 0, z: 0, yaw: 0 } },
    ],
    avatarMotion: [
      { clip: "jump-air", seconds: 352 / 24 },
      { clip: "land", seconds: 16 / 24 },
      { clip: "dance", seconds: 16 / 24 },
    ],
    motion,
    cameraMotion: cameraPath(descentFollowCameraKeys()),
    prompt:
      "One continuous descending shot travels through an original geometric city, an open-shaft cathedral, a basement club and a small DJ studio. All four spaces stay connected in world coordinates. Authored slow tower breathing and taxi shuffling remain visible without sound; prepared low and high bands pull those poses. Floors, room dimensions and camera travel stay fixed. Preserve the open central route through each floor and the editable camera lens.",
  };
}

function avenuePatch(): Partial<Recipe> {
  const motion = storyMotion(avenueParts(), 192, true);
  motion.acousticListener = "camera";
  motion.acousticZones = [
    {
      id: "avenue-outdoor",
      label: "Open avenue · dry",
      kind: "outdoor",
      center: [0, 0, 0],
      dimensions: [64, 100, 64],
    },
  ];
  return {
    frames: 193,
    seconds: 8,
    loop: true,
    avatarPose: { x: 0, y: 0, z: 10, yaw: 0 },
    avatarMotion: "dance",
    motion,
    cameraMotion: cameraPath([
      {
        id: "avenue-open",
        frame: 0,
        position: [2, 3.6, 20],
        target: [0, 2, 6],
        fov: 66,
        easing: "easeInOut",
      },
      {
        id: "avenue-sweep",
        frame: 96,
        position: [-2, 4.2, 18],
        target: [0, 2, 6],
        fov: 68,
        easing: "easeInOut",
      },
      {
        id: "avenue-return",
        frame: 192,
        position: [2, 3.6, 20],
        target: [0, 2, 6],
        fov: 66,
        easing: "easeInOut",
      },
    ]),
    prompt:
      "A continuous eight-second camera sway watches a single 1.8 metre mannequin dance on a geometric city avenue. Grounded towers breathe inward and recover, while two yellow taxis shuffle between lane positions. Low measured energy pulls the tower squeeze, and high measured energy pulls the taxi shuffle, on top of a gentle authored progression. The street floor and camera path stay stable. This outdoor scene is acoustically dry.",
  };
}

/** Fresh self-contained takes; changing one saved preset never changes the catalogue. */
export function createStoryPreset(id: string): Recipe {
  if (!STORY_PRESETS.some((preset) => preset.id === id))
    throw new Error(`Unknown story preset: ${id}`);
  const recipe = validateMorphRecipe({
    ...structuredClone(defaultRecipe),
    scene: "stage",
    stageLook: "dark-grid",
    screen: false,
    avatar: true,
    avatarAsset: "mannequin",
    background: "#080b12",
    objects: [],
    audioRoutes: [],
    orbit: 0,
    dolly: 0,
    depthFar: 180,
    ...(id === "endless-descent" ? descentPatch() : avenuePatch()),
  });
  return id === "endless-descent"
    ? withDescentView(recipe, "first-person")
    : recipe;
}
