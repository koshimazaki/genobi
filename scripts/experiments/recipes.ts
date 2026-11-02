/** Editable, bounded studies for the local LTX pilot. No provider calls. */
import { createMotionPreset } from "../../src/world-builder/motion-presets";
import { validateRecipe, type Recipe } from "../../src/world-builder/recipe";
import type {
  SceneStateKey,
  SceneTransform,
} from "../../src/world-builder/scene-state";
import { assertAnalysisFrames, assertGuideBounds } from "./contracts";

export type Study = "fruit" | "architecture" | "falling" | "room";
export interface Cue {
  frame: number;
  source: "low" | "high" | "authored";
  method: "positive-band-change" | "authored-frame";
  transitionFrames: number;
}

/** These are candidate band onsets, not kick/snare or instrument labels. */
export function selectCues(recipe: Recipe): Cue[] {
  const last = recipe.frames - 1;
  return (
    [
      ["low", 0.22, 0.4],
      ["high", 0.62, 0.78],
    ] as const
  ).map(([source, from, to]) => {
    const data = recipe.bandEnvelopes[source];
    let frame = Math.round(((from + to) / 2) * last),
      score = 0;
    for (let i = Math.ceil(from * last); i <= Math.floor(to * last); i++) {
      const previous = ((data[i - 1] ?? 0) + (data[i - 2] ?? 0)) / 2;
      const delta = (data[i] ?? 0) - previous;
      if (delta > score) {
        score = delta;
        frame = i;
      }
    }
    return {
      frame,
      source: score > 0 ? source : "authored",
      method: score > 0 ? "positive-band-change" : "authored-frame",
      transitionFrames: 6,
    };
  });
}

function compact<T>(input: T): T {
  return JSON.parse(
    JSON.stringify(input, (_key, value) =>
      typeof value === "number" ? Math.round(value * 1000) / 1000 : value,
    ),
  ) as T;
}

function parts(values: SceneTransform[]) {
  return Object.fromEntries(
    values.map((part, i) => [
      `voxel-${String(i).padStart(3, "0")}`,
      compact(part),
    ]),
  );
}

/** A cue starts a short morph; its arrival is recorded separately. */
export function bakeCues(states: SceneStateKey[], cues: Cue[], frames: number) {
  if (
    cues.length !== 2 ||
    cues.some(
      (cue, i) =>
        !Number.isInteger(cue.frame) ||
        !Number.isInteger(cue.transitionFrames) ||
        cue.transitionFrames < 1 ||
        cue.frame < 1 ||
        cue.frame + cue.transitionFrames >= frames ||
        (i > 0 &&
          cue.frame <= cues[i - 1].frame + cues[i - 1].transitionFrames),
    )
  )
    throw new Error(
      "Two ordered cues with non-overlapping morph windows are required.",
    );
  const key = (index: number, frame: number, name: string) => ({
    ...compact(structuredClone(states[index])),
    id: name,
    frame,
    easing: "easeInOut" as const,
  });
  return [
    key(0, 0, "start"),
    key(0, cues[0].frame, "hold-a"),
    key(1, cues[0].frame + cues[0].transitionFrames, "arrive-b"),
    key(1, cues[1].frame, "hold-b"),
    key(2, cues[1].frame + cues[1].transitionFrames, "arrive-c"),
  ];
}

function towers(count: number, tall = false): SceneTransform[] {
  const floors = count / 8;
  return Array.from({ length: count }, (_, i) => {
    const tower = Math.floor(i / floors),
      level = i % floors;
    const height = tall ? 3.2 : 1.15 + (tower % 4) * 0.18;
    return {
      x: ((tower % 4) - 1.5) * (tall ? 8 : 5),
      y: (level + 0.5) * height,
      z: tower < 4 ? (tall ? -12 : -5) : tall ? 12 : 5,
      scale: 1,
      scaleX: tall ? 5 : 2.8,
      scaleY: height * 0.96,
      scaleZ: tall ? 5 : 2.8,
    };
  });
}

function diamond(count: number): SceneTransform[] {
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count;
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    const r = Math.sqrt(1 - y * y),
      x = r * Math.cos(angle),
      z = r * Math.sin(angle);
    const norm = Math.abs(x) + Math.abs(y) + Math.abs(z);
    return {
      x: (8 * x) / norm,
      y: 9 + (8 * y) / norm,
      z: (8 * z) / norm,
      scale: 1.25,
    };
  });
}

function nave(): SceneTransform[] {
  return Array.from({ length: 96 }, (_, i) => {
    const bay = Math.floor(i / 8),
      part = i % 8,
      side = part < 4 ? -1 : 1;
    const kind = part % 4,
      z = -14.6 + bay * 2.65;
    if (kind === 0)
      return {
        x: side * 8,
        y: 8,
        z,
        scale: 2,
        scaleX: 0.55,
        scaleY: 8,
        scaleZ: 0.55,
      };
    if (kind === 1)
      return {
        x: side * 6,
        y: 18.6,
        z,
        scale: 2,
        scaleX: 4,
        scaleY: 0.35,
        scaleZ: 0.7,
        rotationZ: side * -0.58,
      };
    if (kind === 2)
      return {
        x: side * 9.4,
        y: 10,
        z,
        scale: 2,
        scaleX: 0.2,
        scaleY: 7,
        scaleZ: 1.25,
      };
    return {
      x: side * 4,
      y: 0.1,
      z,
      scale: 2,
      scaleX: 4,
      scaleY: 0.1,
      scaleZ: 1.3,
    };
  });
}

function falling(recipe: Recipe) {
  const last = recipe.frames - 1,
    entry = Math.round(last / 2);
  const motion = recipe.motion!;
  const church = nave(),
    party = nave().map((part) => ({
      ...part,
      x: part.x * 0.6,
      y: part.y * 0.2,
      z: part.z * 0.5,
      scaleX: (part.scaleX ?? 1) * 0.6,
      scaleY: Math.max(0.1, (part.scaleY ?? 1) * 0.2),
      scaleZ: Math.max(0.1, (part.scaleZ ?? 1) * 0.5),
    }));
  const dims: [number, number, number][] = [
    [28, 24, 32],
    [20, 24, 32],
    [12, 5, 16],
  ];
  const listeners: [number, number, number][] = [
    [0, 20, 10],
    [0, 20, 10],
    [0, 2.8, 6],
  ];
  motion.instances!.count = 96;
  motion.instances!.size = 1;
  motion.instances!.palette = ["#a7b7bb", "#d1c5ac", "#8ca5b2", "#b49c82"];
  motion.stateKeys = [towers(96, true), church, party].map((layout, i) => ({
    id: `space-${i}`,
    label: ["City towers", "Cathedral proxy", "Party room"][i],
    frame: [0, entry, last][i],
    easing: "easeInOut",
    objects: parts(layout),
    room: { dimensions: dims[i], listener: listeners[i] },
  }));
  motion.room = {
    id: "interior-proxy",
    dimensions: dims[0],
    center: [0, 0, 0],
    source: [-1, 1.5, -2],
    listener: listeners[0],
    absorption: {
      floor: 0.22,
      ceiling: 0.24,
      north: 0.2,
      south: 0.2,
      east: 0.18,
      west: 0.18,
    },
    seed: 271,
    wallThickness: 0.12,
    visible: false,
  };
  motion.mappings = [
    {
      id: "walls",
      source: "low",
      property: "spread",
      amount: 0.025,
      enabled: true,
    },
    {
      id: "height",
      source: "mid",
      property: "roomHeight",
      amount: 0.2,
      enabled: true,
    },
  ];
  motion.intensity = 0.7;
  recipe.cameraMotion = {
    version: 1,
    enabled: true,
    keys: [
      {
        id: "sky",
        frame: 0,
        position: [0, 68, 20],
        target: [0, 10, -5],
        fov: 64,
        easing: "easeInOut",
      },
      {
        id: "nave",
        frame: entry,
        position: [0, 20, 10],
        target: [0, 1, -12],
        fov: 62,
        easing: "easeInOut",
      },
      {
        id: "party",
        frame: last,
        position: [0, 2.8, 6],
        target: [0, 2, -6],
        fov: 64,
        easing: "easeInOut",
      },
    ],
    audio: { enabled: true, source: "low", amount: 0.35, motion: "push" },
  };
  recipe.depthFar = 160;
  recipe.prompt =
    "A descending camera moves between towers into a tall cathedral and a compact party room. Preserve the authored camera and changing structure. Warm stone, cool glass and restrained luminous detail.";
  return entry;
}

export function createStudy(
  study: Study,
  analysis: Pick<Recipe, "envelope" | "bandEnvelopes">,
  dimensions: { width: number; height: number; frames: number },
  inputCues?: Cue[],
) {
  assertGuideBounds(dimensions);
  assertAnalysisFrames(analysis, dimensions.frames);
  const preset = {
    fruit: "fruit-morph-fine",
    architecture: "voxel-architecture-128",
    falling: "city-to-loft",
    room: "apartment-morph",
  }[study];
  const recipe = createMotionPreset(preset);
  Object.assign(recipe, dimensions, analysis, { seconds: null, loop: false });
  const motion = recipe.motion!,
    last = recipe.frames - 1;
  let cues: Cue[] = [],
    indoorFromFrame: number | null = null;
  if (study === "fruit" || study === "architecture") {
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
    cues = inputCues ?? selectCues(recipe);
    motion.stateKeys = bakeCues(states, cues, recipe.frames);
  } else if (study === "falling") indoorFromFrame = falling(recipe);
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
      })),
      indoorFromFrame,
      acousticMeaning:
        study === "falling"
          ? "Stylized single-room interior proxy; outdoor soundtrack stays dry. No outdoor or coupled-room propagation."
          : study === "room"
            ? "Explicit changing single-room enclosure."
            : "No acoustic enclosure.",
      requiredNext:
        "Review guide and cues; create a geometry-aligned art-directed first frame before model submission.",
    },
  };
}
