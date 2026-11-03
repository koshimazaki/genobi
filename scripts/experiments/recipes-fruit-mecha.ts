/**
 * fruit-mecha: the dancer held front-on between two fruits that each step
 * Banana -> Papaya -> Apple on the bass cues, always two different fruits.
 * Built from the 192-voxel fine preset: voxels 0-95 carry the left fruit and
 * 96-191 the right, each a 96-voxel fruit layout placed and scaled on its side.
 */
import { fruitLayouts } from "../../src/world-builder/motion-fruit-layouts";
import type { Recipe } from "../../src/world-builder/recipe";
import type {
  SceneStateKey,
  SceneTransform,
  SceneVector,
} from "../../src/world-builder/scene-state";
import { heldCamera, mapping } from "./recipe-parts";
import { bakeSequence, peakCues, type Cue } from "./recipe-cues";
import { MIN_CUE_GAP } from "./recipes-fruit";

/**
 * fruit-dance's three cues would need seven keys of 192 voxels (73 KB); the
 * 64 KB recipe bound fits five, so this study takes the top two bass peaks.
 * Each fruit still shows all three fruits over the take.
 */
export const MECHA_CUES = 2;

export const MECHA_FRUITS = ["Banana", "Papaya", "Apple"] as const;
/** Each fruit's largest extent in metres, before the bass pulse. */
const ACROSS = { Banana: 0.7, Papaya: 0.6, Apple: 0.6 } as const;
/** Left opens on the banana (state 0), right on the apple (state 2). */
export const MECHA_SIDES = [
  { side: "left", x: -1.1, y: 1.3, start: 0, first: 0 },
  { side: "right", x: 1.1, y: 1.4, start: 2, first: 96 },
] as const;
/** Pulse about a point between the fruits: louder pushes them outward. */
export const MECHA_PIVOT: SceneVector = [0, 1.35, 0];
export const MECHA_PULSE = 0.3;
/** Emissive intensity at full bass on every fruit voxel (the `primitives` target). */
export const MECHA_GLOW = 0.5;
export const MECHA_FOV = 40;
/** The 1.8 m mannequin's share of the frame height at its own plane. */
export const MECHA_FILL = 0.85;
const DANCER = 1.8,
  // The dance steps the feet a little toward the lens; leave room below them.
  FOOT_MARGIN = 0.15,
  CAMERA_HEIGHT = 1;
/** Voxel scale has an engine floor of 0.1. */
const MIN_SCALE = 0.1;

const extent = (parts: SceneTransform[], f: "x" | "y" | "z") => {
  const axis = { x: "scaleX", y: "scaleY", z: "scaleZ" } as const;
  const half = (p: SceneTransform) => (p.scale * (p[axis[f]] ?? 1)) / 2;
  const lo = Math.min(...parts.map((p) => p[f] - half(p)));
  const hi = Math.max(...parts.map((p) => p[f] + half(p)));
  return { lo, hi, size: hi - lo, mid: (lo + hi) / 2 };
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** One fruit layout centred on its spot and scaled to its `ACROSS` size. */
function place(
  layout: SceneTransform[],
  label: (typeof MECHA_FRUITS)[number],
  spot: (typeof MECHA_SIDES)[number],
) {
  const [x, y, z] = (["x", "y", "z"] as const).map((f) => extent(layout, f));
  const k = ACROSS[label] / Math.max(x.size, y.size);
  // Centimetre rounding keeps seven keys of 192 voxels under 64 KB.
  return Object.fromEntries(
    layout.map((part, n) => [
      `voxel-${String(spot.first + n).padStart(3, "0")}`,
      {
        ...part,
        x: r2(spot.x + (part.x - x.mid) * k),
        y: r2(spot.y + (part.y - y.mid) * k),
        z: r2((part.z - z.mid) * k),
        scale: r2(Math.max(MIN_SCALE, part.scale * k)),
      },
    ]),
  );
}

/** The camera distance at which the dancer fills `MECHA_FILL` of the frame. */
export function mechaFraming(fov = MECHA_FOV) {
  const frame = DANCER / MECHA_FILL;
  const distance = frame / (2 * Math.tan((fov / 2) * (Math.PI / 180)));
  // Feet just above the bottom edge: the frame's centre sits half a frame up.
  return { frame, distance, centre: frame / 2 - FOOT_MARGIN };
}

export function fruitMecha(recipe: Recipe, inputCues?: Cue[]) {
  const motion = recipe.motion!;
  if (motion.instances?.count !== 192)
    throw new Error("fruit-mecha needs the 192-voxel fine fruit preset.");
  const layouts = fruitLayouts(96);
  const template = motion.stateKeys[0];
  const sideStates = MECHA_SIDES.map((spot) =>
    MECHA_FRUITS.map((label, i): SceneStateKey => ({
      ...structuredClone(template),
      id: `${spot.side}-${label.toLowerCase()}`,
      label,
      objects: place(layouts[i], label, spot),
    })),
  );
  const cues =
    inputCues ??
    // fruit-dance's rule (top bass peaks 2 s apart, a quick snap), two cues.
    peakCues(recipe.bandEnvelopes.low, MECHA_CUES, MIN_CUE_GAP, 5);
  const sequences = MECHA_SIDES.map((spot) =>
    Array.from({ length: cues.length + 1 }, (_, i) => (spot.start + i) % 3),
  );
  const [left, right] = sideStates.map((states, s) =>
    bakeSequence(states, sequences[s], cues, recipe.frames),
  );
  motion.stateKeys = left.map((key, i) => ({
    ...key,
    label: `${key.label} | ${right[i].label}`,
    objects: { ...key.objects, ...right[i].objects },
  }));
  motion.pivot = [...MECHA_PIVOT];
  // No twist: about the shared pivot it would swing the fruits round the dancer.
  motion.mappings = [mapping("pulse", "low", "scale", MECHA_PULSE)];
  recipe.audioRoutes = [
    {
      id: "glow-low",
      enabled: true,
      source: "low",
      target: "primitives",
      property: "glow",
      amount: MECHA_GLOW,
      threshold: 0,
      invert: false,
      lerp: 1,
    },
  ];
  recipe.avatar = true;
  recipe.avatarAsset = "mannequin";
  recipe.avatarMotion = "dance";
  recipe.avatarPose = { x: 0, y: 0, z: 0, yaw: 0 };
  const { distance, centre } = mechaFraming();
  recipe.cameraMotion = heldCamera(
    [0, CAMERA_HEIGHT, r2(distance)],
    [0, r2(centre), 0],
    MECHA_FOV,
  );
  recipe.prompt =
    "A blocky mecha figure dances on a dark studio sweep between a banana and an apple floating at shoulder height; on the heavy beats each fruit changes into another fruit, and both swell and glow with the bass. Hard studio light, still camera, front view.";
  const names = (s: number) =>
    sequences[s].map((i) => MECHA_FRUITS[i]).join(" > ");
  return {
    cues,
    design: {
      camera: `held front view at ${CAMERA_HEIGHT} m, ${MECHA_FOV} degree lens, dancer ${MECHA_FILL * 100}% of the frame`,
      fruit: "left at x -1.1 y 1.3, right at x 1.1 y 1.4, 0.6-0.7 m across",
      cueRule: `top ${MECHA_CUES} low-band peaks at least ${MIN_CUE_GAP} frames (2 s) apart`,
      left: names(0),
      right: names(1),
      mappings: `scale low ${MECHA_PULSE} about ${MECHA_PIVOT.join(", ")}; glow low ${MECHA_GLOW} (audio route)`,
      avatar: "mannequin, dance, scene centre",
    },
  };
}
