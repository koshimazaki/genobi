/** Editable, bounded studies for the local LTX pilot. No provider calls. */
import { createMotionPreset } from "../../src/world-builder/motion-presets";
import { validateRecipe, type Recipe } from "../../src/world-builder/recipe";
import { assertAnalysisFrames, assertGuideBounds } from "./contracts";
import {
  clockwork,
  compact,
  diamond,
  orbit360,
  parts,
  towers,
} from "./recipe-parts";
import { bakeCues, selectCues, type Cue } from "./recipe-cues";
import {
  canyon,
  cathedralWalls,
  falling,
  pyramidInside,
  pyramidInsideSpin,
  roomWalls,
  type RoomDesign,
} from "./recipes-rooms";
import { fruitDance, fruitMorph, singleFruit } from "./recipes-fruit";
import { cathedralGallery, towersDescent } from "./recipes-clap";
import { diamondStudy } from "./recipes-diamond";
import { fruitMecha } from "./recipes-fruit-mecha";
import { STUDIES } from "./studies.mjs";

export { bakeCues, bakeSequence, peakCues, selectCues } from "./recipe-cues";
export type { Cue } from "./recipe-cues";

export { STUDIES };
export type Study = (typeof STUDIES)[number];

const PRESETS: Record<Study, string> = {
  fruit: "fruit-morph-fine",
  // 96 blocks, not 192: up to seven keys (three cues) must fit the 64 KB recipe.
  "fruit-dance": "fruit-morph",
  // Two 96-voxel fruits side by side: the fine preset's 192 ids split in half.
  "fruit-mecha": "fruit-morph-fine",
  architecture: "voxel-architecture-128",
  clockwork: "voxel-architecture-128",
  pulse: "voxel-architecture-128",
  rubik: "voxel-architecture-128",
  "pyramid-inside": "voxel-architecture-128",
  "pyramid-inside-spin": "voxel-architecture-128",
  diamond: "voxel-architecture-128",
  "fruit-apple": "fruit-morph",
  "fruit-banana": "fruit-morph",
  "fruit-papaya": "fruit-morph",
  "fruit-apple-banana": "fruit-morph",
  "fruit-banana-apple": "fruit-morph",
  falling: "city-to-loft",
  cathedral: "city-to-loft",
  "cathedral-walls": "city-to-loft",
  canyon: "city-to-loft",
  "towers-descent": "city-to-loft",
  "cathedral-gallery": "city-to-loft",
  "cathedral-gallery-grow": "city-to-loft",
  room: "apartment-morph",
  "room-walls": "apartment-morph",
};

export function createStudy(
  study: Study,
  analysis: Pick<Recipe, "envelope" | "bandEnvelopes">,
  dimensions: { width: number; height: number; frames: number },
  inputCues?: Cue[],
) {
  assertGuideBounds(dimensions);
  assertAnalysisFrames(analysis, dimensions.frames);
  if (!(STUDIES as readonly string[]).includes(study))
    throw new Error(`Unknown study ${study}.`);
  const preset = PRESETS[study];
  const recipe = createMotionPreset(preset);
  Object.assign(recipe, dimensions, analysis, { seconds: null, loop: false });
  const motion = recipe.motion!,
    last = recipe.frames - 1;
  let cues: Cue[] = [],
    indoorFromFrame: number | null = null,
    design: RoomDesign["design"] = {};
  const room = (built: RoomDesign) => {
    indoorFromFrame = built.indoorFromFrame;
    design = built.design;
  };
  if (
    study === "fruit" ||
    study === "architecture" ||
    study === "clockwork" ||
    study === "pulse" ||
    study === "rubik"
  ) {
    const states = structuredClone(motion.stateKeys);
    if (study === "fruit") {
      [states[1], states[2]] = [states[2], states[1]];
      motion.mappings = [
        {
          id: "twist",
          property: "twistY",
          source: "mid",
          amount: 0.35,
          enabled: true,
        },
        {
          id: "pulse",
          property: "scale",
          source: "low",
          amount: 0.3,
          enabled: true,
        },
      ];
      recipe.prompt =
        "A golden banana made of tiny sculptural blocks transforms into a red apple, then an orange papaya. The same blocks retain identity while twisting gently to music. Dark studio background, precise warm highlights, polished fruit surfaces.";
    } else {
      states[1] = {
        ...states[1],
        label: "Towers",
        objects: parts(towers(128)),
      };
      states[2] = {
        ...states[2],
        label: "Diamond",
        objects: parts(diamond(128)),
      };
      recipe.radius = 44;
      recipe.targetY = 10;
      recipe.elevation = 18;
      recipe.fov = 46;
      motion.mappings = [
        {
          // Bass raises the mass: the towers stand up on the low band.
          id: "lift-low",
          property: "lift",
          source: "low",
          amount: 1.2,
          enabled: true,
        },
        {
          // Voice breathes the mass rather than moving it.
          id: "scale-mid",
          property: "scale",
          source: "mid",
          amount: 0.18,
          enabled: true,
        },
        {
          // Hi-hat flicks the pieces apart, the percussive one.
          id: "spread-high",
          property: "spread",
          source: "high",
          amount: 0.25,
          enabled: true,
        },
      ];
      recipe.prompt =
        "A monumental stepped pyramid rearranges into a cluster of tall towers, then a floating faceted diamond. Preserve the same material pieces and exact framing. Warm limestone with subtle metallic edges against a dark minimal environment.";
    }
    if (study === "pulse" || study === "rubik") {
      // The simplest audio-reactive case: one pyramid that breathes with the
      // bass and lifts on the kick, no morph; the camera circles it once.
      motion.mappings = [
        {
          id: "scale-low",
          property: "scale",
          source: "low",
          amount: 0.9,
          enabled: true,
        },
        {
          id: "lift-sub",
          property: "lift",
          source: "sub",
          amount: 1.5,
          enabled: true,
        },
        {
          id: "spread-high",
          property: "spread",
          source: "high",
          amount: 0.3,
          enabled: true,
        },
      ];
      if (study === "rubik")
        // Terraces turn against each other on the voice (twist grows with
        // height, so the layers shear like a cube puzzle); bass still swells.
        motion.mappings = [
          {
            id: "twist-mid",
            property: "twistY",
            source: "mid",
            amount: 0.55,
            enabled: true,
          },
          {
            id: "scale-low",
            property: "scale",
            source: "low",
            amount: 0.45,
            enabled: true,
          },
          {
            id: "lift-sub",
            property: "lift",
            source: "sub",
            amount: 0.6,
            enabled: true,
          },
        ];
      states.splice(1);
      motion.stateKeys = [
        {
          ...compact(structuredClone(states[0])),
          id: "start",
          frame: 0,
          easing: "easeInOut" as const,
        },
      ];
      recipe.radius = 34;
      recipe.targetY = 6;
      recipe.elevation = 16;
      recipe.fov = 46;
      recipe.cameraMotion = orbit360(recipe);
      recipe.prompt =
        "A monumental stepped pyramid breathes and swells with the music, its terraces lifting on every beat, while the camera circles it once. Same structure throughout, no other shape appears.";
      cues = [];
    } else if (study === "clockwork") {
      // One mass that twists in place instead of morphing into other shapes:
      // the shape stays a pyramid, the pieces turn like a clockwork.
      motion.mappings = [
        {
          // Voice turns the mass: the clockwork's main rotation.
          id: "twist-mid",
          property: "twistY",
          source: "mid",
          amount: 0.9,
          enabled: true,
        },
        {
          // Bass lifts it off the plate.
          id: "lift-low",
          property: "lift",
          source: "low",
          amount: 0.5,
          enabled: true,
        },
        {
          // Hi-hat flickers the pieces apart, the percussive one.
          id: "spread-high",
          property: "spread",
          source: "high",
          amount: 0.28,
          enabled: true,
        },
        {
          // The kick rocks it forward and back.
          id: "rock-sub",
          property: "twistX",
          source: "sub",
          amount: 0.18,
          enabled: true,
        },
      ];
      states[0] = {
        ...states[0],
        label: "Clockwork",
        // Vanes, not cubes: a twisted cube still reads as a cube.
        objects: parts(
          clockwork(
            Object.keys((states[0] as { objects: object }).objects).length,
          ),
        ),
      };
      // One mass only: the other preset states would change the instance set.
      states.splice(1);
      motion.stateKeys = [
        {
          ...compact(structuredClone(states[0])),
          id: "start",
          frame: 0,
          easing: "easeInOut" as const,
        },
      ];
      // Fill the frame: the preset's 44-unit stand-off renders the mass tiny.
      recipe.radius = 11.5;
      recipe.targetY = 2.6;
      recipe.elevation = 13;
      recipe.fov = 42;
      recipe.cameraMotion = orbit360(recipe);
      recipe.prompt =
        "A single clockwork pyramid of dark glass and steel voxels twists in place like a Rubik's cube, its terraces turning against each other to the music while cyan light runs along the seams. The camera circles it once, three hundred and sixty degrees. Same mass throughout, no other structure appears.";
      cues = [];
    } else {
      cues = inputCues ?? selectCues(recipe);
      motion.stateKeys = bakeCues(states, cues, recipe.frames);
    }
  } else if (study === "fruit-dance") {
    const built = fruitDance(recipe, inputCues);
    cues = built.cues;
    design = built.design;
  } else if (study === "fruit-mecha") {
    const built = fruitMecha(recipe, inputCues);
    cues = built.cues;
    design = built.design;
  } else if (study === "diamond") design = diamondStudy(recipe);
  else if (
    study === "fruit-apple" ||
    study === "fruit-banana" ||
    study === "fruit-papaya"
  )
    design = singleFruit(recipe, study);
  else if (study === "fruit-apple-banana" || study === "fruit-banana-apple")
    design = fruitMorph(recipe, study);
  else if (study === "falling") indoorFromFrame = falling(recipe);
  else if (study === "cathedral") indoorFromFrame = falling(recipe, true);
  else if (study === "cathedral-walls") room(cathedralWalls(recipe));
  else if (study === "canyon") room(canyon(recipe));
  else if (study === "towers-descent") room(towersDescent(recipe));
  else if (study === "cathedral-gallery") room(cathedralGallery(recipe));
  else if (study === "cathedral-gallery-grow")
    room(cathedralGallery(recipe, true));
  else if (study === "room-walls") room(roomWalls(recipe));
  else if (study === "pyramid-inside") room(pyramidInside(recipe));
  else if (study === "pyramid-inside-spin") room(pyramidInsideSpin(recipe));
  else
    motion.stateKeys.forEach((key, i) => {
      key.frame = Math.round((last * i) / 2);
    });
  const validated = validateRecipe(compact(recipe));
  return {
    recipe: validated,
    metadata: {
      study,
      sourcePreset: preset,
      status: "authored-guide-not-LTX-qualified",
      cues: cues.map((cue, i) => ({
        ...cue,
        arrivalFrame: cue.frame + cue.transitionFrames,
        target: validated.motion!.stateKeys[(i + 1) * 2].label,
        ...(cue.peak === undefined ? {} : { peak: cue.peak }),
      })),
      indoorFromFrame,
      design,
      acousticMeaning:
        study === "falling" || study === "cathedral"
          ? "Stylized single-room interior proxy; outdoor soundtrack stays dry. No outdoor or coupled-room propagation."
          : study === "room" || study === "room-walls"
            ? "Explicit changing single-room enclosure."
            : study === "cathedral-walls" ||
                study === "canyon" ||
                study === "towers-descent" ||
                study === "cathedral-gallery" ||
                study === "cathedral-gallery-grow" ||
                study === "pyramid-inside" ||
                study === "pyramid-inside-spin"
              ? "Stylized single-room box proxy whose size follows the low band with the visible walls; not the real geometry's acoustics."
              : "No acoustic enclosure.",
      requiredNext:
        "Review guide and cues; create a geometry-aligned art-directed first frame before model submission.",
    },
  };
}
