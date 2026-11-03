/**
 * fruit-mecha: the dancer held front-on between two fruits that each step
 * Banana -> Papaya -> Apple on the two strongest bass peaks, always two
 * different fruits, each change an explosion that reassembles as the next
 * fruit. Seven keys must fit the 64 KB recipe, so it is built from the
 * 96-voxel preset: 48 voxels per fruit, voxels 0-47 left and 48-95 right.
 *
 * fruit-mecha-morph: the same scene with no cues, two keys only, the fine
 * preset's 96 voxels per fruit blended continuously by the low band.
 */
import { fruitLayouts } from "../../src/world-builder/motion-fruit-layouts";
import type { Recipe } from "../../src/world-builder/recipe";
import type {
  SceneStateKey,
  SceneTransform,
  SceneVector,
} from "../../src/world-builder/scene-state";
import { heldCamera, mapping } from "./recipe-parts";
import { peakCues, type Cue } from "./recipe-cues";
import { MIN_CUE_GAP, tinted } from "./recipes-fruit";

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
  { side: "left", x: -1.1, y: 1.3, start: 0 },
  { side: "right", x: 1.1, y: 1.4, start: 2 },
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
  first: number,
  /** Voxel size factor (a coarser layout needs bigger blocks). */
  grow = 1,
) {
  const [x, y, z] = (["x", "y", "z"] as const).map((f) => extent(layout, f));
  const k = ACROSS[label] / Math.max(x.size, y.size);
  // Centimetre rounding keeps seven keys of 192 voxels under 64 KB.
  return Object.fromEntries(
    layout.map((part, n) => [
      `voxel-${String(first + n).padStart(3, "0")}`,
      {
        ...part,
        x: r2(spot.x + (part.x - x.mid) * k),
        y: r2(spot.y + (part.y - y.mid) * k),
        z: r2((part.z - z.mid) * k),
        scale: r2(Math.max(MIN_SCALE, part.scale * k) * grow),
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

/** Frames from the hold to the burst, and from the burst to the next fruit. */
export const BURST_FRAMES = 8;
/** How far each voxel flies out, in fruit radii, at the burst ("explode more"). */
export const BURST_REACH = [3, 4] as const;
/** Burst voxels keep this far from the scene's centre line (the dancer, 0.4 m half width). */
export const BURST_CLEAR = 0.6;
/** And this far inside the frame edges, in metres at their depth. */
const FRAME_MARGIN = 0.1;

/** A repeatable 0-1 value per voxel and channel. */
function seeded(n: number, channel: number) {
  const v = Math.sin(n * 12.9898 + channel * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Whether a point is inside the held mecha view with a margin, and clear of
 * the dancer. The frame widens with distance from the lens, so a burst that
 * flies back (away from the camera) has more room than one that flies forward.
 */
export function inMechaView(x: number, y: number, z: number) {
  const { frame, distance, centre } = mechaFraming();
  const depth = (distance - z) / distance;
  if (depth <= 0.2) return false;
  const halfHeight = (frame / 2) * depth - FRAME_MARGIN,
    halfWidth = (frame / 2) * (16 / 9) * depth - FRAME_MARGIN;
  return (
    Math.abs(x) >= BURST_CLEAR &&
    Math.abs(x) <= halfWidth &&
    Math.abs(y - centre) <= halfHeight &&
    y >= 0.05
  );
}

/**
 * The fruit blown apart: every voxel flies 3 to 4 fruit radii across the
 * picture (fixed per voxel) from its fruit's centre along its own direction, turned outward
 * and back from the lens with a wide seeded spread, with a little spin. A
 * flight that would leave the view or reach the dancer stops at the edge
 * of what is allowed. The burst keeps the outgoing fruit's colour.
 */
export function burst(
  objects: Record<string, SceneTransform>,
  centre: SceneVector,
  radius: number,
) {
  const outward = Math.sign(centre[0]) || 1;
  return Object.fromEntries(
    Object.entries(objects).map(([id, part]) => {
      const n = Number(id.slice(6));
      const jitter = (c: number) => (seeded(n, c) - 0.5) * 1.6;
      const d = [
        outward * Math.abs(part.x - centre[0]) + outward * 0.5 + jitter(1),
        part.y - centre[1] + jitter(2),
        -Math.abs(part.z - centre[2]) - 1.6 + jitter(4),
      ];
      const length = Math.hypot(...d) || 1;
      const u = d.map((v) => v / length);
      // The reach is measured across the picture (x and y), not into it.
      let reach =
        (radius *
          (BURST_REACH[0] + (BURST_REACH[1] - BURST_REACH[0]) * seeded(n, 0))) /
        Math.max(0.3, Math.hypot(u[0], u[1]));
      // Centimetre positions, as stored, so the check holds for what is saved.
      const at = (t: number) =>
        [part.x + u[0] * t, part.y + u[1] * t, part.z + u[2] * t].map(
          r2,
        ) as SceneVector;
      // Shorten the flight until it lands inside the view, also as the full
      // bass pulse scales it out about the pivot.
      const fits = (p: SceneVector) =>
        inMechaView(...p) &&
        inMechaView(
          ...(p.map(
            (v, k) => MECHA_PIVOT[k] + (v - MECHA_PIVOT[k]) * (1 + MECHA_PULSE),
          ) as SceneVector),
        );
      while (reach > 0.05 && !fits(at(reach))) reach *= 0.9;
      const [x, y, z] = at(reach);
      return [
        id,
        {
          ...part,
          x,
          y,
          z,
          rotation: r2((seeded(n, 3) - 0.5) * 3),
        },
      ];
    }),
  );
}

/** Every other voxel of a 96-voxel layout; `place` enlarges the blocks by cbrt 2. */
const coarse = (layout: SceneTransform[]) =>
  layout.filter((_, n) => n % 2 === 0);

/** One side's three fruits, placed and coloured, voxel ids from `first`. */
function sideFruits(
  spot: (typeof MECHA_SIDES)[number],
  layouts: SceneTransform[][],
  first: number,
  grow: number,
) {
  return MECHA_FRUITS.map((label, i) =>
    tinted(place(layouts[i], label, spot, first, grow), label),
  );
}

/** The dancer, camera, pivot and bass glow both mecha studies share. */
function mechaStage(recipe: Recipe, pulse: number, glow: number) {
  const motion = recipe.motion!;
  motion.pivot = [...MECHA_PIVOT];
  // No twist: about the shared pivot it would swing the fruits round the dancer.
  motion.mappings = [mapping("pulse", "low", "scale", pulse)];
  recipe.audioRoutes = [
    {
      id: "glow-low",
      enabled: true,
      source: "low",
      target: "primitives",
      property: "glow",
      amount: glow,
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
}

const joined = (a: Record<string, SceneTransform>, b: typeof a) => ({
  ...a,
  ...b,
});

export function fruitMecha(recipe: Recipe, inputCues?: Cue[]) {
  const motion = recipe.motion!;
  if (motion.instances?.count !== 96)
    throw new Error("fruit-mecha needs the 96-voxel fruit preset.");
  const layouts = fruitLayouts(96).map(coarse);
  const template = motion.stateKeys[0];
  const sides = MECHA_SIDES.map((spot, s) =>
    sideFruits(spot, layouts, s * 48, Math.cbrt(2)),
  );
  const last = recipe.frames - 1;
  // The top two bass peaks 2 s apart, each with room for its burst window.
  const cues =
    inputCues ??
    peakCues(recipe.bandEnvelopes.low, MECHA_CUES, MIN_CUE_GAP, BURST_FRAMES)
      .filter((cue) => cue.frame > BURST_FRAMES)
      .map((cue) => ({
        ...cue,
        frame: cue.frame - BURST_FRAMES,
        transitionFrames: 2 * BURST_FRAMES,
      }));
  const shown = (s: number, i: number) => (MECHA_SIDES[s].start + i) % 3;
  const label = (i: number) =>
    `${MECHA_FRUITS[shown(0, i)]} | ${MECHA_FRUITS[shown(1, i)]}`;
  const state = (i: number) =>
    joined(sides[0][shown(0, i)], sides[1][shown(1, i)]);
  const exploded = (i: number) =>
    joined(
      ...(MECHA_SIDES.map((spot, s) =>
        burst(
          sides[s][shown(s, i)],
          [spot.x, spot.y, 0],
          ACROSS[MECHA_FRUITS[shown(s, i)]] / 2,
        ),
      ) as [Record<string, SceneTransform>, Record<string, SceneTransform>]),
    );
  const key = (
    id: string,
    frame: number,
    name: string,
    objects: Record<string, SceneTransform>,
  ): SceneStateKey => ({
    ...structuredClone(template),
    id,
    label: name,
    frame: Math.min(last, frame),
    easing: "easeInOut",
    objects,
  });
  motion.stateKeys = [
    key("start", 0, label(0), state(0)),
    ...cues.flatMap((cue, i) => {
      const peak = cue.frame + BURST_FRAMES;
      return [
        key(`hold-${i + 1}`, cue.frame, label(i), state(i)),
        key(`burst-${i + 1}`, peak, `${label(i)} (burst)`, exploded(i)),
        key(`arrive-${i + 1}`, peak + BURST_FRAMES, label(i + 1), state(i + 1)),
      ];
    }),
  ];
  motion.transitionStyle = "direct";
  mechaStage(recipe, MECHA_PULSE, MECHA_GLOW);
  recipe.prompt =
    "A blocky mecha figure dances on a dark studio sweep between a banana and an apple floating at shoulder height; on the heavy beats each fruit bursts apart into flying blocks that reassemble as another fruit, and both swell and glow with the bass. Hard studio light, still camera, front view.";
  const names = (s: number) =>
    Array.from(
      { length: cues.length + 1 },
      (_, i) => MECHA_FRUITS[shown(s, i)],
    ).join(" > ");
  return {
    cues,
    design: {
      camera: `held front view at ${CAMERA_HEIGHT} m, ${MECHA_FOV} degree lens, dancer ${MECHA_FILL * 100}% of the frame`,
      fruit:
        "48 voxels each; left at x -1.1 y 1.3, right at x 1.1 y 1.4, 0.6-0.7 m across",
      cueRule: `top ${MECHA_CUES} low-band peaks at least ${MIN_CUE_GAP} frames (2 s) apart`,
      burst: `hold ${BURST_FRAMES} frames before the peak, burst ${BURST_REACH.join("-")} radii out at the peak, the next fruit ${BURST_FRAMES} frames after`,
      left: names(0),
      right: names(1),
      mappings: `scale low ${MECHA_PULSE} about ${MECHA_PIVOT.join(", ")}; glow low ${MECHA_GLOW} (audio route)`,
      avatar: "mannequin, dance, scene centre",
    },
  };
}

/** fruit-mecha-morph's glow at full bass. */
export const MECHA_MORPH_GLOW = 0.6;
/**
 * The morph's low pulse. One pivot between the fruits pushes them outward as
 * they swell, so it stays 0.3 rather than 0.5.
 */
export const MECHA_MORPH_PULSE = MECHA_PULSE;
/** Morph progress per unit of `low`, as the single-fruit morphs. */
export const MECHA_MORPH_AMOUNT = 1.2;

export function fruitMechaMorph(recipe: Recipe) {
  const motion = recipe.motion!;
  if (motion.instances?.count !== 192)
    throw new Error("fruit-mecha-morph needs the 192-voxel fine fruit preset.");
  const layouts = fruitLayouts(96);
  const template = motion.stateKeys[0];
  const sides = MECHA_SIDES.map((spot, s) =>
    sideFruits(spot, layouts, s * 96, 1),
  );
  // Rest: banana | apple. Peak: each side's next fruit, papaya | banana.
  const at = (i: number) =>
    joined(
      sides[0][(MECHA_SIDES[0].start + i) % 3],
      sides[1][(MECHA_SIDES[1].start + i) % 3],
    );
  const name = (i: number) =>
    MECHA_SIDES.map((spot) => MECHA_FRUITS[(spot.start + i) % 3]).join(" | ");
  motion.stateKeys = [0, 1].map((i) => ({
    ...structuredClone(template),
    id: i ? "peak" : "rest",
    label: name(i),
    frame: i ? recipe.frames - 1 : 0,
    easing: "linear" as const,
    objects: at(i),
  }));
  motion.transitionStyle = "direct";
  motion.morphControl = {
    version: 1,
    enabled: true,
    originStateId: "rest",
    progress: {
      mode: "manual",
      position: 0,
      source: "low",
      // Cancel the preset's intensity so the blend reads the band directly.
      amount: Math.min(2, MECHA_MORPH_AMOUNT / motion.intensity),
    },
    target: {
      position: 0,
      amount: 0,
      mode: "blend",
      routes: [{ stateId: "peak", source: "low", amount: 1, enabled: false }],
    },
  };
  mechaStage(recipe, MECHA_MORPH_PULSE, MECHA_MORPH_GLOW);
  recipe.prompt =
    "A blocky grey and gold mecha dances on a dark studio floor between two fruits at shoulder height; on every bass swell the fruits swell and glow and change into other fruits, a banana becoming a papaya and an apple becoming a banana, and relax back as the bass fades. Hard studio light, still camera, energetic dancing.";
  return {
    camera: `held front view at ${CAMERA_HEIGHT} m, ${MECHA_FOV} degree lens, dancer ${MECHA_FILL * 100}% of the frame`,
    morph: `continuous: morphControl ${name(0)} -> ${name(1)} on low, progress = low x ${MECHA_MORPH_AMOUNT}, clamped at 1`,
    mappings: `scale low ${MECHA_MORPH_PULSE} about ${MECHA_PIVOT.join(", ")} (one shared pivot, so not raised); glow low ${MECHA_MORPH_GLOW}`,
    avatar: "mannequin, dance, scene centre",
  };
}
