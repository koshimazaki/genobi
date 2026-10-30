import { strToU8 } from "fflate";
import { parseScene } from "../../shared/scene/parse";
import type { SceneSpec } from "../../shared/scene/types";
import { validateRecipe, type Recipe } from "../world-builder/recipe";
import type { Bundle } from "./bundle";

/**
 * The 3D sources a project carries beside its manifest: the World Builder
 * recipe last applied or captured (`world/recipe.json`) and the 3D camera's
 * scene last loaded (`world/scene.json`). Like the prompt brief they are
 * free files in the bundle, written into the ZIP by Download bundle and
 * checked again by Open bundle; the server's project copy does not hold them.
 */
export const WORLD_RECIPE_PATH = "world/recipe.json";
export const WORLD_SCENE_PATH = "world/scene.json";
export const WORLD_PATHS = [WORLD_RECIPE_PATH, WORLD_SCENE_PATH] as const;
// Pretty-printed; the validators hold the documents themselves to 64 and 256 KB.
const LIMIT = { [WORLD_RECIPE_PATH]: 160_000, [WORLD_SCENE_PATH]: 512_000 };

function json(bundle: Bundle, path: (typeof WORLD_PATHS)[number]) {
  const bytes = bundle.files.get(path);
  if (!bytes) return undefined;
  if (bytes.length > LIMIT[path])
    throw new Error(`${path} exceeds ${LIMIT[path] / 1000} KB`);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new Error(`${path} is not JSON`);
  }
}

/** The bundle's recipe and scene, each checked by its own validator. */
export function readWorldFiles(bundle: Bundle): {
  recipe?: Recipe;
  scene?: SceneSpec;
} {
  const recipe = json(bundle, WORLD_RECIPE_PATH);
  const scene = json(bundle, WORLD_SCENE_PATH);
  const out: { recipe?: Recipe; scene?: SceneSpec } = {};
  try {
    if (recipe !== undefined) out.recipe = validateRecipe(recipe);
  } catch (error) {
    throw new Error(`World recipe: ${(error as Error).message}`, {
      cause: error,
    });
  }
  try {
    if (scene !== undefined) out.scene = parseScene(scene);
  } catch (error) {
    throw new Error(`3D scene: ${(error as Error).message}`, {
      cause: error,
    });
  }
  return out;
}

/** The bundle with one world file written, or the same bundle when unchanged. */
export function writeWorldFile(
  bundle: Bundle,
  path: (typeof WORLD_PATHS)[number],
  value: Recipe | SceneSpec,
): Bundle {
  const bytes = strToU8(`${JSON.stringify(value, null, 2)}\n`);
  const before = bundle.files.get(path);
  if (
    before &&
    before.length === bytes.length &&
    before.every((b, i) => b === bytes[i])
  )
    return bundle;
  const files = new Map(bundle.files);
  files.set(path, bytes);
  const next = {
    project: { ...bundle.project, revision: bundle.project.revision + 1 },
    files,
  };
  readWorldFiles(next);
  return next;
}

/** The world files of `from`, carried onto `to` (a reload of the same project). */
export function carryWorldFiles(from: Bundle | undefined, to: Bundle) {
  if (!from || from.project.id !== to.project.id) return to;
  for (const path of WORLD_PATHS) {
    const bytes = from.files.get(path);
    if (bytes && !to.files.has(path)) to.files.set(path, bytes);
  }
  return to;
}
