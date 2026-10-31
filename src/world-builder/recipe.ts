import { roomPresets } from "./room-presets";
import {
  BUILDER_CHARACTER_ASSETS as CHARACTER_ASSETS,
  BUILDER_CHARACTER_MODELS as CHARACTER_MODELS,
  type BuilderCharacterAsset as CharacterAsset,
} from "./character-catalog";
import { validMotion, type AvatarMotion } from "./motion";
import {
  parseCreatureReference,
  type CreatureReference,
} from "../../shared/scene/creature-reference";
import {
  shapes,
  validTransform,
  validTextures,
  type Transform,
  type SurfaceMap,
} from "./scene-contract";
import { framesForSeconds, MOVE_SECONDS } from "./take-duration";
import { cameraProgressAt } from "./loop";
import { validateAvatarPose, type AvatarPose } from "./avatar-pose";
import { trackOffset, validateAvatarPath, type AvatarKey } from "./avatar-path";
import { ORBIT_RANGE } from "./prop-orbit";
import type { SceneMotion } from "./scene-state";
import { sceneObjects } from "./scene-instances";
import { validateSceneMotion } from "./scene-state-validation";
import {
  LEGACY_AUDIO_FIELDS,
  legacyFromRoutes,
  legacyRoutes,
  validateRoutes,
  type ModRoute,
} from "./mod-routes";
/** Portable scene contract. No scripts, remote URLs or generation side effects. */
export const parameterSchema = {
  width: { min: 256, max: 1920, step: 64, initial: 1280 },
  height: { min: 256, max: 1920, step: 64, initial: 704 },
  frames: { min: 9, max: 241, step: 8, initial: 97 },
  fov: { min: 15, max: 100, step: 1, initial: 55 },
  azimuth: { min: -180, max: 180, step: 1, initial: 25 },
  elevation: { min: -89, max: 89, step: 1, initial: 15 },
  radius: { min: 2, max: 60, step: 0.5, initial: 12 },
  targetX: { min: -40, max: 40, step: 0.25, initial: 0 },
  targetZ: { min: -40, max: 40, step: 0.25, initial: 0 },
  /** Up to 40 m so a tracking shot can start on a character high in the air. */
  targetY: { min: -5, max: 40, step: 0.25, initial: 1.5 },
  /** Degrees per take: ±360 is one full turn. */
  orbit: { min: -360, max: 360, step: 1, initial: 30 },
  dolly: { min: -0.8, max: 2, step: 0.1, initial: 0 },
  light: { min: 0, max: 5, step: 0.1, initial: 2 },
  patternScale: { min: 0.01, max: 1, step: 0.01, initial: 0.13 },
  intensity: { min: 0.1, max: 3, step: 0.1, initial: 1 },
  speed: { min: 0, max: 3, step: 0.1, initial: 1 },
  /** Linear depth pass range in metres from the camera: near is white, far black. */
  depthNear: { min: 0.05, max: 50, step: 0.05, initial: 0.1 },
  depthFar: { min: 1, max: 600, step: 1, initial: 50 },
} as const;
export type Parameter = keyof typeof parameterSchema;
export type Shape = (typeof shapes)[number];
export interface Prop extends Transform {
  id: string;
  shape: Shape;
  x: number;
  y: number;
  z: number;
  scale: number;
  spin: number;
  /** Radians per second around (`orbitX`, `orbitZ`), the centre by default. */
  orbit?: number;
  orbitX?: number;
  orbitZ?: number;
  color: string;
  prompt: string;
}
export type Recipe = Record<Parameter, number> & {
  version: 1;
  scene: "stage" | "neuro" | "playground";
  avatar: boolean;
  avatarAsset: CharacterAsset;
  avatarMotion: AvatarMotion;
  creatureReference: CreatureReference | null;
  avatarPose: AvatarPose;
  /** Timed keys after `avatarPose` (frame 0); absent keeps the pose static. */
  avatarPath?: AvatarKey[];
  layout: Record<
    string,
    Transform & {
      x: number;
      y: number;
      z: number;
      rotation: number;
      scale: number;
    }
  >;
  textures: SurfaceMap;
  cameraCurve: "linear" | "easeInOut";
  cameraShot: string;
  elevationEnd: number | null;
  bandEnvelopes: { low: number[]; mid: number[]; high: number[] };
  /** The mod matrix (`mod-routes.ts`); the old single-route fields migrate into it. */
  audioRoutes: ModRoute[];
  fps: 24;
  /** The move's duration; when set, `frames` follows it on the 8k + 1 grid. */
  seconds: number | null;
  /** Seamless loop: the take is one period, so frame `frames` equals frame 0. */
  loop?: boolean;
  /** The Stage's backdrop screen; `false` removes it, absent keeps it. */
  screen?: boolean;
  prompt: string;
  background: string;
  objects: Prop[];
  /** Optional deterministic state animation, bounded voxels and one acoustic room. */
  motion?: SceneMotion;
  envelope: number[];
};
export const defaultRecipe: Recipe = {
  ...(Object.fromEntries(
    Object.entries(parameterSchema).map(([key, value]) => [key, value.initial]),
  ) as Record<Parameter, number>),
  version: 1,
  scene: "stage",
  avatar: false,
  avatarAsset: "mannequin",
  avatarMotion: "idle",
  creatureReference: null,
  avatarPose: { x: 0, y: 0, z: 5, yaw: 0 },
  layout: {},
  textures: {},
  cameraCurve: "linear",
  cameraShot: "custom",
  elevationEnd: null,
  bandEnvelopes: { low: [], mid: [], high: [] },
  audioRoutes: legacyRoutes({}, []),
  fps: 24,
  seconds: null,
  prompt: "",
  background: "#171e29",
  envelope: [],
  objects: [
    {
      id: "subject",
      shape: "sphere",
      x: 0,
      y: 1.6,
      z: 0,
      scale: 1.5,
      spin: 0,
      color: "#e9b86c",
      prompt: "",
    },
    {
      id: "plinth",
      shape: "cylinder",
      x: 0,
      y: 0.3,
      z: 0,
      scale: 1.8,
      spin: 0,
      color: "#566371",
      prompt: "",
    },
  ],
};
export const presets: Record<string, Partial<Recipe>> = {
  ...roomPresets,
  Playground: {
    scene: "playground",
    background: "#a9c3d4",
    radius: 23,
    azimuth: 155,
    elevation: 28,
    targetY: 2,
    objects: [],
  },
  "Playground avatar": {
    scene: "playground",
    avatar: true,
    background: "#a9c3d4",
    radius: 9,
    azimuth: 0,
    elevation: 15,
    objects: [],
  },
  Studio: {},
  Monument: {
    background: "#142923",
    azimuth: -35,
    elevation: 6,
    radius: 14,
    orbit: 55,
    objects: [
      {
        id: "arch-left",
        shape: "box",
        x: -2,
        y: 2,
        z: 0,
        scale: 2,
        spin: 0,
        color: "#c0cdac",
        prompt: "",
      },
      {
        id: "arch-right",
        shape: "box",
        x: 2,
        y: 2,
        z: -2,
        scale: 2,
        spin: 0.2,
        color: "#eea275",
        prompt: "",
      },
      {
        id: "orb",
        shape: "sphere",
        x: 0,
        y: 4,
        z: 0,
        scale: 1.1,
        spin: 0,
        color: "#d8e9ee",
        prompt: "",
      },
    ],
  },
  Projection: {
    azimuth: 0,
    elevation: 0,
    radius: 10,
    targetY: 2,
    orbit: 0,
    objects: [],
  },
};
export function presetRecipe(name: string): Recipe {
  if (!(name in presets)) throw new Error("Unknown preset.");
  return validateRecipe(
    structuredClone({ ...defaultRecipe, ...presets[name] }),
  );
}
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const color = (v: unknown) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
export function validateRecipe(input: unknown): Recipe {
  if (!plain(input)) throw new Error("Expected a scene recipe object.");
  if (JSON.stringify(input).length > 64_000)
    throw new Error("Recipe exceeds 64 KB.");
  const allowed = new Set([
    ...Object.keys(defaultRecipe),
    "loop",
    "screen",
    "avatarPath",
    "motion",
    ...LEGACY_AUDIO_FIELDS,
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new Error("Unknown recipe field.");
  const legacy = Object.fromEntries(
    LEGACY_AUDIO_FIELDS.filter((k) => k in input).map((k) => [k, input[k]]),
  );
  const r = structuredClone({ ...defaultRecipe, ...input }) as Recipe;
  for (const key of LEGACY_AUDIO_FIELDS)
    delete (r as Record<string, unknown>)[key];
  if (
    r.version !== 1 ||
    r.fps !== 24 ||
    !["stage", "neuro", "playground"].includes(r.scene)
  )
    throw new Error("Unsupported scene recipe version, renderer or fps.");
  if (r.loop !== undefined && typeof r.loop !== "boolean")
    throw new Error("loop must be true or false.");
  if (r.screen !== undefined && typeof r.screen !== "boolean")
    throw new Error("screen must be true or false.");
  if (r.seconds !== null) {
    if (!finite(r.seconds, MOVE_SECONDS.min, MOVE_SECONDS.max))
      throw new Error(
        `seconds must be between ${MOVE_SECONDS.min} and ${MOVE_SECONDS.max.toFixed(2)} (9 to 241 frames at 24 fps).`,
      );
    r.frames = framesForSeconds(r.seconds);
  }
  for (const [key, range] of Object.entries(parameterSchema)) {
    if (!finite(r[key as Parameter], range.min, range.max))
      throw new Error(`${key} must be between ${range.min} and ${range.max}.`);
  }
  if (r.depthFar <= r.depthNear)
    throw new Error("depthFar must be greater than depthNear.");
  if (r.width % 64 || r.height % 64)
    throw new Error("Dimensions must be multiples of 64.");
  if (!Number.isInteger(r.frames) || (r.frames - 1) % 8)
    throw new Error("Use 8k + 1 frames (9, 17, …, 241).");
  if (
    !color(r.background) ||
    typeof r.prompt !== "string" ||
    r.prompt.length > 4000
  )
    throw new Error("Invalid background or prompt.");
  if (
    !Array.isArray(r.envelope) ||
    r.envelope.length > 241 ||
    r.envelope.some((x) => !finite(x, 0, 1))
  )
    throw new Error("Invalid audio envelope.");
  if (!Array.isArray(r.objects) || r.objects.length > 24)
    throw new Error("Use at most 24 primitives.");
  if (typeof r.avatar !== "boolean") throw new Error("Invalid avatar pose.");
  validateAvatarPose(r.avatarPose);
  if (r.avatarPath !== undefined) validateAvatarPath(r.avatarPath);
  if (!CHARACTER_ASSETS.includes(r.avatarAsset))
    throw new Error("Invalid character or motion.");
  r.avatarMotion = validMotion(
    r.avatarMotion,
    CHARACTER_MODELS[r.avatarAsset].clips,
  );
  if (r.creatureReference !== null)
    r.creatureReference = parseCreatureReference(r.creatureReference);
  if (r.avatarAsset !== "creature") r.creatureReference = null;
  if (!plain(r.layout) || Object.keys(r.layout).length > 40)
    throw new Error("Invalid playground layout.");
  for (const [id, item] of Object.entries(r.layout)) {
    if (
      !/^(ramp-(10|20|30|45)|track|jump-(left|right)|u-ramp|stairs|slope|pillar|box-(a|b)|car-(a|b)|drone)$/.test(
        id,
      ) ||
      !plain(item) ||
      Object.keys(item).some(
        (k) =>
          ![
            "x",
            "y",
            "z",
            "rotation",
            "rotationX",
            "rotationZ",
            "scale",
            "scaleX",
            "scaleY",
            "scaleZ",
          ].includes(k),
      ) ||
      ![item.x, item.y, item.z].every((v) => finite(v, -40, 40)) ||
      !finite(item.rotation, -Math.PI, Math.PI) ||
      !finite(item.scale, 0.1, 8) ||
      !validTransform(item)
    )
      throw new Error("Invalid playground transform.");
  }
  const ids = new Set<string>();
  for (const p of r.objects) {
    if (
      !plain(p) ||
      Object.keys(p).some(
        (k) =>
          ![
            "id",
            "shape",
            "x",
            "y",
            "z",
            "scale",
            "spin",
            "rotation",
            "rotationX",
            "rotationZ",
            "scaleX",
            "scaleY",
            "scaleZ",
            "orbit",
            "orbitX",
            "orbitZ",
            "color",
            "prompt",
          ].includes(k),
      ) ||
      typeof p.id !== "string" ||
      !/^[\w-]{1,48}$/.test(p.id) ||
      ids.has(p.id) ||
      !shapes.includes(p.shape) ||
      !color(p.color) ||
      typeof p.prompt !== "string" ||
      p.prompt.length > 1000 ||
      !finite(p.scale, 0.1, 8) ||
      !validTransform(p) ||
      !finite(p.spin, -3, 3) ||
      (p.orbit !== undefined &&
        !finite(p.orbit, ORBIT_RANGE.min, ORBIT_RANGE.max)) ||
      ![p.orbitX ?? 0, p.orbitZ ?? 0].every((v) => finite(v, -40, 40)) ||
      (p.rotation !== undefined && !finite(p.rotation, -Math.PI, Math.PI)) ||
      ![p.x, p.y, p.z].every((v) => finite(v, -40, 40))
    )
      throw new Error("Invalid primitive.");
    ids.add(p.id);
  }
  if (r.motion !== undefined) r.motion = validateSceneMotion(r.motion, r);
  if (!validTextures(r.textures, r))
    throw new Error("Invalid surface texture assignments.");
  if (
    !["linear", "easeInOut"].includes(r.cameraCurve) ||
    typeof r.cameraShot !== "string" ||
    r.cameraShot.length > 40 ||
    (r.elevationEnd !== null && !finite(r.elevationEnd, -89, 89))
  )
    throw new Error("Invalid camera movement.");
  const objectIds = sceneObjects(r).map((p) => p.id);
  r.audioRoutes =
    // The old single-route fields still describe one route; when present
    // (an older recipe, or an agent patch), they replace the matrix. Fields
    // the patch leaves out come from route 1, so it changes only what it names.
    "audioRoutes" in input && !Object.keys(legacy).length
      ? validateRoutes(r.audioRoutes, objectIds)
      : legacyRoutes(
          { ...legacyFromRoutes(input.audioRoutes), ...legacy },
          objectIds,
        );
  if (
    !plain(r.bandEnvelopes) ||
    Object.keys(r.bandEnvelopes).some(
      (k) => !["low", "mid", "high"].includes(k),
    ) ||
    !["low", "mid", "high"].every(
      (k) =>
        Array.isArray(r.bandEnvelopes[k as "low"]) &&
        r.bandEnvelopes[k as "low"].length <= 241 &&
        r.bandEnvelopes[k as "low"].every((v) => finite(v, 0, 1)),
    )
  )
    throw new Error("Invalid audio routing.");
  return r;
}
export function cameraAt(r: Recipe, frame: number) {
  const { turn, sweep } = cameraProgressAt(r, frame);
  const a = ((r.azimuth + r.orbit * turn) * Math.PI) / 180;
  const e =
    ((r.elevation + ((r.elevationEnd ?? r.elevation) - r.elevation) * sweep) *
      Math.PI) /
    180;
  const radius = r.radius * (1 + r.dolly * sweep);
  const [x, y, z] = cameraTargetAt(r, frame);
  return [
    x + Math.sin(a) * Math.cos(e) * radius,
    y + Math.sin(e) * radius,
    z + Math.cos(a) * Math.cos(e) * radius,
  ] as const;
}
/** Where the camera aims at `frame`: a tracking shot follows the character's path. */
export function cameraTargetAt(r: Recipe, frame: number) {
  const [dx, dy, dz] = trackOffset(r, frame);
  return [r.targetX + dx, r.targetY + dy, r.targetZ + dz] as const;
}
