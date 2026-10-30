import type { SceneSpec } from "../../shared/scene/types";
import {
  WORLD_RECIPE_PATH,
  WORLD_SCENE_PATH,
  writeWorldFile,
} from "../director/world-files";
import type { Recipe } from "../world-builder/recipe";
import { studioStore } from "./store";

/**
 * Keeps the open project's 3D sources current: the World Builder recipe a
 * hand-off applied or a take captured, and the scene the 3D camera loaded.
 * An undoable edit like any other; nothing when no project is open.
 */
function record(
  path: typeof WORLD_RECIPE_PATH | typeof WORLD_SCENE_PATH,
  value: Recipe | SceneSpec,
  store = studioStore,
) {
  const bundle = store.getState().director.bundle;
  if (!bundle) return false;
  const next = writeWorldFile(bundle, path, value);
  if (next !== bundle) store.getState().actions.commit(next, bundle);
  return true;
}
export const recordWorldRecipe = (recipe: Recipe, store = studioStore) =>
  record(WORLD_RECIPE_PATH, recipe, store);
export const recordWorldScene = (scene: SceneSpec, store = studioStore) =>
  record(WORLD_SCENE_PATH, scene, store);
