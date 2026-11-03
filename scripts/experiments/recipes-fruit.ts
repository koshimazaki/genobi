/** Fruit studies: a dancer beside a fruit that swaps on the bass, and single fruits. */
import type { Recipe } from "../../src/world-builder/recipe";
import type {
  SceneStateKey,
  SceneVector,
} from "../../src/world-builder/scene-state";
import { compact, heldCamera, mapping } from "./recipe-parts";
import { bakeSequence, peakCues, type Cue } from "./recipe-cues";

/** Two seconds at 24 fps: no two shape changes closer than this. */
export const MIN_CUE_GAP = 48;
export const MAX_DANCE_CUES = 3;
const FRUIT_SCALE = 0.7,
  FRUIT_OFFSET = 2;

export function fruitDance(recipe: Recipe, inputCues?: Cue[]) {
  const motion = recipe.motion!;
  // Preset order is Banana, Papaya, Apple. Open on the apple, then alternate.
  const states = structuredClone(motion.stateKeys).map((key) => ({
    ...key,
    // Shrink the fruit to 0.7 about its own centre (0, 2.2, 0), then set it
    // 2 m to the dancer's side at chest height, close but never touching.
    objects: Object.fromEntries(
      Object.entries(key.objects).map(([id, part]) => [
        id,
        {
          ...part,
          x: part.x * FRUIT_SCALE + FRUIT_OFFSET,
          y: 1.2 + (part.y - 2.2) * FRUIT_SCALE,
          z: part.z * FRUIT_SCALE,
          scale: part.scale * FRUIT_SCALE,
        },
      ]),
    ),
  }));
  const cues =
    inputCues ??
    peakCues(
      recipe.bandEnvelopes.low,
      MAX_DANCE_CUES,
      MIN_CUE_GAP,
      // A quick snap: the change lands within a quarter second of the hit.
      5,
    );
  const sequence = cues.length
    ? Array.from({ length: cues.length + 1 }, (_, i) => (i % 2 ? 0 : 2))
    : [2];
  motion.stateKeys = bakeSequence(states, sequence, cues, recipe.frames);
  // The fruit pulses about its own centre beside the dancer.
  motion.pivot = [FRUIT_OFFSET, 1.2, 0];
  motion.mappings = [
    mapping("twist", "mid", "twistY", 0.35),
    mapping("pulse", "low", "scale", 0.3),
  ];
  recipe.avatar = true;
  recipe.avatarAsset = "mannequin";
  recipe.avatarMotion = "dance";
  recipe.avatarPose = { x: 0, y: 0, z: 0, yaw: 0 };
  // A held front view, slightly elevated. At 6.5 m a 46 degree lens sees a
  // frame ~5.5 m tall, so the 1.8 m dancer fills about a third of it; the
  // target sits between the dancer and the fruit.
  recipe.cameraMotion = heldCamera([1, 1.9, 6.5], [1, 1.1, 0], 46);
  recipe.prompt =
    "A dancer moves alone on a pale studio floor beside a large glossy red apple that hangs at chest height, snapping into a ripe yellow banana on the heavy beats and back into the apple. Soft daylight from one side, clean white background, crisp reflections on the fruit skin.";
  return {
    cues,
    design: {
      camera: "held front view, slightly elevated",
      fruit: "2 m beside the dancer at chest height, no orbit",
      cueRule: `top ${MAX_DANCE_CUES} low-band peaks at least ${MIN_CUE_GAP} frames (2 s) apart`,
      sequence: sequence.map((i) => states[i].label),
      avatar: "mannequin, dance, scene centre",
    },
  };
}

export const SINGLE_FRUITS = {
  "fruit-apple": "Apple",
  "fruit-banana": "Banana",
  "fruit-papaya": "Papaya",
} as const;
export type SingleFruit = keyof typeof SINGLE_FRUITS;

const PROMPTS: Record<SingleFruit, string> = {
  "fruit-apple":
    "A single glossy red apple rests on a pale studio floor, swelling gently on the bass and turning a little with the melody. Soft daylight from one side, clean white background.",
  "fruit-banana":
    "A single ripe yellow banana rests on a pale studio floor, swelling gently on the bass and turning a little with the melody. Soft daylight from one side, clean white background.",
  "fruit-papaya":
    "A single ripe orange papaya stands on a pale studio floor, swelling gently on the bass and turning a little with the melody. Soft daylight from one side, clean white background.",
};

type FruitState = SceneStateKey;

function fruitState(recipe: Recipe, label: string): FruitState {
  const state = recipe.motion!.stateKeys.find((key) => key.label === label);
  if (!state) throw new Error(`The fruit preset has no ${label}.`);
  return state;
}

/** A preset fruit's pieces moved to rest on the floor, centred on (x, z). */
function onFloor(
  state: FruitState,
  size: number,
  centre?: { x: number; z: number },
) {
  const pieces = Object.values(state.objects);
  const half = (p: (typeof pieces)[number]) => (p.scale * size) / 2;
  const lo = (f: "x" | "y" | "z") =>
    Math.min(...pieces.map((p) => p[f] - half(p)));
  const hi = (f: "x" | "y" | "z") =>
    Math.max(...pieces.map((p) => p[f] + half(p)));
  const cx = (lo("x") + hi("x")) / 2,
    cz = (lo("z") + hi("z")) / 2,
    floor = lo("y");
  const dx = centre ? centre.x - cx : 0,
    dz = centre ? centre.z - cz : 0;
  const objects = Object.fromEntries(
    Object.entries(state.objects).map(([id, part]) => [
      id,
      { ...part, x: part.x + dx, y: part.y - floor, z: part.z + dz },
    ]),
  );
  return {
    objects,
    cx: cx + dx,
    cz: cz + dz,
    height: hi("y") - floor,
    width: hi("x") - lo("x"),
  };
}

/**
 * A held front view 8 degrees above, framed so a fruit of this size is about
 * half the frame in whichever direction it is larger. The frame is
 * 2 d tan(23 deg) tall.
 */
function frontCamera(
  recipe: Recipe,
  fit: { cx: number; cz: number; height: number; width: number },
) {
  const fov = 46,
    aspect = recipe.width / recipe.height;
  const frame = Math.max(2 * fit.height, (2 * fit.width) / aspect);
  const distance = frame / (2 * Math.tan((fov / 2) * (Math.PI / 180)));
  const lift = 8 * (Math.PI / 180);
  const target: SceneVector = [fit.cx, fit.height / 2, fit.cz];
  return heldCamera(
    [
      fit.cx,
      fit.height / 2 + distance * Math.sin(lift),
      fit.cz + distance * Math.cos(lift),
    ],
    target,
    fov,
  );
}

function fruitMappings() {
  return [
    mapping("pulse", "low", "scale", 0.3),
    mapping("twist", "mid", "twistY", 0.2),
  ];
}

const roundSize = (fit: { height: number; width: number }) => ({
  height: Math.round(fit.height * 100) / 100,
  width: Math.round(fit.width * 100) / 100,
});

/**
 * One fruit, no morph, no figure: three identical states of the named preset
 * fruit set on the floor, pulsing on low (scale 0.3) with a small mid twist
 * (0.2). One held front view, framed so the fruit is about half the frame tall.
 */
export function singleFruit(recipe: Recipe, study: SingleFruit) {
  const motion = recipe.motion!;
  const label = SINGLE_FRUITS[study];
  const state = fruitState(recipe, label);
  const fit = onFloor(state, motion.instances?.size ?? 1);
  const last = recipe.frames - 1;
  motion.stateKeys = [0, Math.round(last / 2), last].map((frame, i) => ({
    ...compact({
      ...state,
      id: `${label.toLowerCase()}-${i}`,
      objects: fit.objects,
    }),
    frame,
    easing: "easeInOut" as const,
  }));
  // Pulse from its base so it never sinks.
  motion.pivot = [fit.cx, 0, fit.cz];
  motion.mappings = fruitMappings();
  recipe.cameraMotion = frontCamera(recipe, fit);
  recipe.prompt = PROMPTS[study];
  return {
    camera: "held front view, 8 degrees above, fruit about half the frame",
    fruit: label,
    mappings: "scale low 0.3, twistY mid 0.2",
    size: roundSize(fit),
  };
}

/** Morph progress per unit of `low` (after intensity): the band's p95 (0.8) is the peak fruit. */
export const FRUIT_MORPH_AMOUNT = 1.2;

/** The continuous-morph fruit studies: the fruit at rest, then at full bass. */
export const FRUIT_MORPHS = {
  "fruit-apple-banana": ["Apple", "Banana"],
  "fruit-banana-apple": ["Banana", "Apple"],
} as const;
export type FruitMorph = keyof typeof FRUIT_MORPHS;

const MORPH_PROMPTS: Record<FruitMorph, string> = {
  "fruit-apple-banana":
    "A single red apple hovers over a dark studio floor, seen from the front; on every bass swell it stretches and bends into a ripe yellow banana and relaxes back into the apple as the bass fades. Hard studio light, still camera.",
  "fruit-banana-apple":
    "A single ripe yellow banana hovers over a dark studio floor, seen from the front; on every bass swell it curls and rounds into a red apple and relaxes back into the banana as the bass fades. Hard studio light, still camera.",
};

/**
 * One fruit that is the rest fruit in silence and the peak fruit at full
 * bass: the engine's continuous morph (`morphControl`) blends every voxel
 * from the rest state to the peak state by the low band, so the timeline
 * clock never moves it. Both shapes rest on the floor about the rest fruit's
 * centre, the single fruits' low pulse and mid twist still apply, and the
 * view is the single fruits' front view framed on the rest fruit.
 */
export function fruitMorph(recipe: Recipe, study: FruitMorph) {
  const motion = recipe.motion!;
  const size = motion.instances?.size ?? 1;
  const [restLabel, peakLabel] = FRUIT_MORPHS[study];
  const rest = onFloor(fruitState(recipe, restLabel), size);
  const peak = onFloor(fruitState(recipe, peakLabel), size, {
    x: rest.cx,
    z: rest.cz,
  });
  const base = fruitState(recipe, restLabel);
  const [restId, peakId] = [restLabel, peakLabel].map((l) => l.toLowerCase());
  motion.stateKeys = [
    { id: restId, label: restLabel, frame: 0, objects: rest.objects },
    {
      id: peakId,
      label: peakLabel,
      frame: recipe.frames - 1,
      objects: peak.objects,
    },
  ].map((key) => ({
    ...compact({ ...base, ...key }),
    easing: "linear" as const,
  }));
  motion.transitionStyle = "direct";
  motion.morphControl = {
    version: 1,
    enabled: true,
    originStateId: restId,
    progress: {
      mode: "manual",
      position: 0,
      source: "low",
      // Progress is low x amount x intensity: cancel the preset's intensity
      // so the blend reads the band directly, whatever the preset holds.
      amount: Math.min(2, FRUIT_MORPH_AMOUNT / motion.intensity),
    },
    // The target never changes: one fixed stop, no audio on the target axis.
    target: {
      position: 0,
      amount: 0,
      mode: "blend",
      routes: [{ stateId: peakId, source: "low", amount: 1, enabled: false }],
    },
  };
  motion.pivot = [rest.cx, 0, rest.cz];
  motion.mappings = fruitMappings();
  recipe.cameraMotion = frontCamera(recipe, rest);
  recipe.prompt = MORPH_PROMPTS[study];
  return {
    camera: `the single fruits' held front view, the ${restLabel.toLowerCase()} about half the frame`,
    morph: `continuous: morphControl ${restLabel} -> ${peakLabel} on low, progress = low x ${FRUIT_MORPH_AMOUNT}, clamped at 1`,
    mappings: "scale low 0.3, twistY mid 0.2",
    size: { rest: roundSize(rest), peak: roundSize(peak) },
  };
}
