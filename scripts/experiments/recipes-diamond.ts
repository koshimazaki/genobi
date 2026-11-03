/** The simplest object test: one faceted diamond, no morph, orbited once. */
import type { Recipe } from "../../src/world-builder/recipe";
import type { SceneVector } from "../../src/world-builder/scene-state";
import { compact, diamond, mapping, orbit360, parts } from "./recipe-parts";

/** The diamond's centre, 8 m over the floor; its pivot and the camera target. */
const CENTRE: SceneVector = [0, 8, 0];
/**
 * `diamond()` is 16 m tall around y = 9. At 0.65 it is ~10.4 m tall, about
 * half of the ~22 m frame height a 46 degree lens sees from 26 m.
 */
const SHRINK = 0.65;

export function diamondStudy(recipe: Recipe) {
  const motion = recipe.motion!;
  const layout = diamond(motion.instances!.count).map((part) => ({
    ...part,
    x: part.x * SHRINK,
    y: CENTRE[1] + (part.y - 9) * SHRINK,
    z: part.z * SHRINK,
    scale: part.scale * SHRINK,
  }));
  const objects = parts(layout),
    last = recipe.frames - 1;
  // Three identical states: the silhouette never morphs.
  motion.stateKeys = [0, Math.round(last / 2), last].map((frame, i) => ({
    ...compact({ id: `diamond-${i}`, label: "Diamond", objects }),
    frame,
    easing: "easeInOut" as const,
  }));
  // Swell and lift about the diamond's own centre, not the preset's.
  motion.pivot = CENTRE;
  // The pulse study's proven pair, plus a small facet twist on the voice.
  motion.mappings = [
    mapping("scale-low", "low", "scale", 0.9),
    mapping("lift-sub", "sub", "lift", 1.5),
    mapping("twist-mid", "mid", "twistY", 0.3),
  ];
  recipe.radius = 26;
  recipe.elevation = 3;
  recipe.targetY = CENTRE[1];
  recipe.fov = 46;
  recipe.cameraMotion = orbit360(recipe);
  recipe.prompt =
    "A single faceted diamond hovers over a softly lit floor, swelling and lifting on the bass while the camera circles it once. Clear crystal facets catch the light; nothing else in the frame.";
  return {
    camera: "orbit 360, radius 26, elevation 3, target at the diamond centre",
    layout: `diamond(${motion.instances!.count}) at ${SHRINK}, centre y ${CENTRE[1]}`,
    mappings: "scale low 0.9, lift sub 1.5, twistY mid 0.3",
  };
}
