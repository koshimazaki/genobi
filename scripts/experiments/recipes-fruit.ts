/** Fruit studies: a dancer beside a fruit that swaps on the bass, and single fruits. */
import type { Recipe } from "../../src/world-builder/recipe";
import type { SceneVector } from "../../src/world-builder/scene-state";
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

/**
 * One fruit, no morph, no figure: three identical states of the named preset
 * fruit set on the floor, pulsing on low (scale 0.3) with a small mid twist
 * (0.2). One held front view, framed so the fruit is about half the frame tall.
 */
export function singleFruit(recipe: Recipe, study: SingleFruit) {
  const motion = recipe.motion!;
  const label = SINGLE_FRUITS[study];
  const state = motion.stateKeys.find((key) => key.label === label);
  if (!state) throw new Error(`The fruit preset has no ${label}.`);
  const size = motion.instances?.size ?? 1;
  const pieces = Object.values(state.objects);
  const half = (p: (typeof pieces)[number]) => (p.scale * size) / 2;
  const lo = (f: "x" | "y" | "z") =>
    Math.min(...pieces.map((p) => p[f] - half(p)));
  const hi = (f: "x" | "y" | "z") =>
    Math.max(...pieces.map((p) => p[f] + half(p)));
  const cx = (lo("x") + hi("x")) / 2,
    cz = (lo("z") + hi("z")) / 2,
    floor = lo("y");
  const height = hi("y") - floor,
    width = hi("x") - lo("x");
  // Rest it on the floor, and pulse from its base so it never sinks.
  const objects = Object.fromEntries(
    Object.entries(state.objects).map(([id, part]) => [
      id,
      { ...part, y: part.y - floor },
    ]),
  );
  const last = recipe.frames - 1;
  motion.stateKeys = [0, Math.round(last / 2), last].map((frame, i) => ({
    ...compact({ ...state, id: `${label.toLowerCase()}-${i}`, objects }),
    frame,
    easing: "easeInOut" as const,
  }));
  motion.pivot = [cx, 0, cz];
  motion.mappings = [
    mapping("pulse", "low", "scale", 0.3),
    mapping("twist", "mid", "twistY", 0.2),
  ];
  // The frame is 2 d tan(23 deg) tall; make the fruit about half of it in
  // whichever direction it is larger.
  const fov = 46,
    aspect = recipe.width / recipe.height;
  const frame = Math.max(2 * height, (2 * width) / aspect);
  const distance = frame / (2 * Math.tan((fov / 2) * (Math.PI / 180)));
  const lift = 8 * (Math.PI / 180);
  const target: SceneVector = [cx, height / 2, cz];
  recipe.cameraMotion = heldCamera(
    [
      cx,
      height / 2 + distance * Math.sin(lift),
      cz + distance * Math.cos(lift),
    ],
    target,
    fov,
  );
  recipe.prompt = PROMPTS[study];
  return {
    camera: "held front view, 8 degrees above, fruit about half the frame",
    fruit: label,
    mappings: "scale low 0.3, twistY mid 0.2",
    size: {
      height: Math.round(height * 100) / 100,
      width: Math.round(width * 100) / 100,
    },
  };
}
