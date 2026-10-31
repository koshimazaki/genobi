/**
 * The scene library's presets: the move library's recipes, bundled at build
 * time from `custom_nodes/director_world_builder/examples/moves/` (the hosted
 * build never fetches the node folder), a few composed here, and the ones a
 * person saves in this browser. Every preset is a recipe that passes
 * `validateRecipe`; loading one keeps the scene's current sound.
 */
import crouch from "../../custom_nodes/director_world_builder/examples/moves/crouch.json";
import danceBalls from "../../custom_nodes/director_world_builder/examples/moves/dance-balls.json";
import fall from "../../custom_nodes/director_world_builder/examples/moves/fall.json";
import fallCathedral from "../../custom_nodes/director_world_builder/examples/moves/fall-cathedral.json";
import fallMediumRoom from "../../custom_nodes/director_world_builder/examples/moves/fall-medium-room.json";
import fallSmallRoom from "../../custom_nodes/director_world_builder/examples/moves/fall-small-room.json";
import jog from "../../custom_nodes/director_world_builder/examples/moves/jog.json";
import jump from "../../custom_nodes/director_world_builder/examples/moves/jump.json";
import roll from "../../custom_nodes/director_world_builder/examples/moves/roll.json";
import skydiveCathedral from "../../custom_nodes/director_world_builder/examples/moves/skydive-cathedral.json";
import sit from "../../custom_nodes/director_world_builder/examples/moves/sit.json";
import sprint from "../../custom_nodes/director_world_builder/examples/moves/sprint.json";
import sword from "../../custom_nodes/director_world_builder/examples/moves/sword.json";
import { presetRecipe, validateRecipe, type Recipe } from "./recipe";

import { motionPresets } from "./motion-presets";

export interface ScenePreset {
  name: string;
  source: "built-in" | "saved";
  /** One line for the card: the moves and the room. */
  summary: string;
  recipe: Recipe;
  /** A move-library preset's file name, without `.json`; load-preset takes it too. */
  file?: string;
}

/** Saved presets: at most 24, each under the recipe's own 64 KB bound. */
export const SAVED_PRESETS = 24;
export const PRESET_NAME = 40;
const STORAGE_KEY = "genobi.world.presets.v1";

/** Every recipe of the move library, keyed by its file name. */
const moves: Record<string, unknown> = {
  jog,
  sprint,
  jump,
  roll,
  fall,
  sit,
  crouch,
  sword,
  "dance-balls": danceBalls,
  "fall-cathedral": fallCathedral,
  "fall-medium-room": fallMediumRoom,
  "fall-small-room": fallSmallRoom,
  "skydive-cathedral": skydiveCathedral,
};

/**
 * A recipe as a preset holds it: attached media names and the audio envelope
 * belong to the files of one session, so they are left out. Media must be
 * reattached after loading, as after any recipe.
 */
export function presetBody(input: unknown): Recipe {
  const recipe = validateRecipe(input);
  return validateRecipe({
    ...recipe,
    textures: {},
    envelope: [],
    bandEnvelopes: { low: [], mid: [], high: [] },
  });
}

function summary(recipe: Recipe) {
  if (recipe.motion)
    return `${recipe.motion.stateKeys.map((k) => k.label).join(" → ")} · ${(recipe.frames / recipe.fps).toFixed(1)} s`;
  const motion = Array.isArray(recipe.avatarMotion)
    ? recipe.avatarMotion.map((m) => m.clip).join(" → ")
    : recipe.avatar
      ? recipe.avatarMotion
      : "no character";
  const seconds = (recipe.frames / recipe.fps).toFixed(1);
  return `${motion} · ${seconds} s`;
}

const preset = (name: string, recipe: Recipe): ScenePreset => ({
  name,
  source: "built-in",
  summary: summary(recipe),
  recipe,
});

/**
 * A figure struck down in the largest room, framed wide, with a slow 50°
 * turn over ten seconds; the fall holds on the floor while the camera keeps
 * moving. Radius and arc keep the camera inside the hall (12 m wide, 30 m
 * long) for the whole turn.
 */
function fallBigRoom(): Recipe {
  const room = presetRecipe("Cathedral");
  return presetBody({
    ...room,
    avatar: true,
    avatarAsset: "mannequin",
    avatarMotion: [
      { clip: "idle", seconds: 2 },
      { clip: "hit", seconds: 0.5 },
      { clip: "fall", seconds: 4 },
    ],
    width: 1024,
    height: 576,
    fov: 32,
    azimuth: -25,
    elevation: 14,
    radius: 13,
    targetX: 0,
    targetY: 1,
    targetZ: 0,
    orbit: 50,
    dolly: 0,
    cameraCurve: "linear",
    cameraShot: "custom",
    seconds: 10,
    prompt:
      "Scene library · fall in a big room: a lone figure is struck and falls in a vast stone hall; slow, wide orbit.",
  });
}

let builtIns: ScenePreset[] | undefined;
/** The built-in presets, in a stable order. */
export function builtInPresets(): ScenePreset[] {
  builtIns ??= [
    ...motionPresets(),
    preset("Fall · big room", fallBigRoom()),
    // The move library's skydive-cathedral under the name a person asks for.
    preset("Skydive · through the rooms", presetBody(skydiveCathedral)),
    ...Object.entries(moves).map(([move, recipe]) => ({
      ...preset(`Move · ${move}`, presetBody(recipe)),
      file: move,
    })),
  ];
  return builtIns.map((p) => ({ ...p, recipe: structuredClone(p.recipe) }));
}

/** Control characters out, length bounded; an empty name is refused. */
export function presetName(input: string) {
  const name = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .slice(0, PRESET_NAME);
  if (!name) throw new Error("Name the preset.");
  return name;
}

/** Saved presets read back; anything that no longer validates is dropped. */
export function parseSaved(raw: string | null): ScenePreset[] {
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: ScenePreset[] = [];
  for (const item of list.slice(0, SAVED_PRESETS)) {
    try {
      const { name, recipe } = item as { name: string; recipe: unknown };
      const body = presetBody(recipe);
      out.push({
        name: presetName(String(name)),
        source: "saved",
        summary: summary(body),
        recipe: body,
      });
    } catch {
      // A preset an older or newer recipe rule refuses is skipped, not fatal.
    }
  }
  return out;
}

/** Newest first; saving a name again replaces it; the oldest past 24 go. */
export function withSaved(
  list: ScenePreset[],
  name: string,
  recipe: unknown,
): ScenePreset[] {
  const clean = presetName(name);
  if (builtInPresets().some((p) => p.name === clean))
    throw new Error("A built-in preset already has that name.");
  const body = presetBody(recipe);
  const next: ScenePreset = {
    name: clean,
    source: "saved",
    summary: summary(body),
    recipe: body,
  };
  return [next, ...list.filter((p) => p.name !== clean)].slice(
    0,
    SAVED_PRESETS,
  );
}

const storage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};
export function loadSaved(): ScenePreset[] {
  try {
    return parseSaved(storage()?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return [];
  }
}
/** False when this browser keeps nothing (private window, blocked storage). */
export function storeSaved(list: ScenePreset[]): boolean {
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(
      STORAGE_KEY,
      JSON.stringify(list.map(({ name, recipe }) => ({ name, recipe }))),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * By name, built-ins first, then this browser's saved presets; else a move
 * library preset by its file name (`fall-cathedral`).
 */
export function findPreset(name: string, saved: ScenePreset[]) {
  const all = [...builtInPresets(), ...saved];
  const found =
    all.find((p) => p.name === name) ?? all.find((p) => p.file === name);
  if (!found)
    throw new Error(
      `No preset named "${name.slice(0, PRESET_NAME)}". List the presets first.`,
    );
  return found;
}
