/** Fruit around a dancer: the fruit swaps shape on the strongest bass hits. */
import type { Recipe } from "../../src/world-builder/recipe";
import { mapping } from "./recipe-parts";
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
    // Shrink the fruit to 0.7 about its own centre (0, 2.2, 0), then move it
    // 2 m off the centre at chest height so it circles close to the dancer
    // without passing through them.
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
  motion.pivot = [0, 1.2, 0];
  // The fruit circles the dancer once; the camera drifts a third of the way round.
  motion.rotation = { axis: "y", turns: 1 };
  motion.mappings = [
    mapping("twist", "mid", "twistY", 0.35),
    mapping("pulse", "low", "scale", 0.3),
  ];
  recipe.avatar = true;
  recipe.avatarAsset = "mannequin";
  recipe.avatarMotion = "dance";
  recipe.avatarPose = { x: 0, y: 0, z: 0, yaw: 0 };
  // At 6.5 m with a 46 degree lens the frame is ~5.5 m tall, so the 1.8 m
  // dancer fills about a third of it; a low 6 degree eye keeps the fruit level.
  recipe.radius = 6.5;
  recipe.targetY = 1.1;
  recipe.elevation = 6;
  recipe.fov = 46;
  recipe.orbit = 120;
  recipe.prompt =
    "A dancer moves alone on a pale studio floor while a large glossy red apple drifts in a slow circle around them, snapping into a ripe yellow banana on the heavy beats and back into the apple. Soft daylight from one side, clean white background, crisp reflections on the fruit skin.";
  return {
    cues,
    design: {
      camera: "legacy orbit, 120 degrees over the take",
      fruit: "orbits the dancer once (motion.rotation y, 1 turn)",
      cueRule: `top ${MAX_DANCE_CUES} low-band peaks at least ${MIN_CUE_GAP} frames (2 s) apart`,
      sequence: sequence.map((i) => states[i].label),
      avatar: "mannequin, dance, scene centre",
    },
  };
}
