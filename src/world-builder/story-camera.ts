import { validateRecipe, type Recipe } from "./recipe";
import type { SceneCameraKey } from "./scene-camera";

export type DescentView = "first-person" | "follow";

// Frame, camera Y/Z, follow look height, first-person aim Y/Z.
// Both views keep these same vertical travel events on the scene clock.
const DESCENT_PATH = [
  [0, 98, 9.5, 95.1, 40, 0],
  [192, 40, 7, 37.1, 12, 0],
  [288, 12, 4.5, 9.1, 4, 0],
  [336, 4, 2.2, 1.9, 0, 0],
  // Once inside the studio, gently look from the opening toward the DJ desk.
  [352, 3.4667, 2.6667, 1.1, 0.55, -1.75],
  [384, 2.4, 3.6, 1.1, 1.1, -3.5],
] as const;

function keyIdentity(id: string) {
  const match = /^descent-(pov-)?camera-([1-6])$/.exec(id);
  return match
    ? {
        view: match[1] ? ("first-person" as const) : ("follow" as const),
        index: Number(match[2]) - 1,
      }
    : null;
}

/** Stable saved-view markers survive manual Shot edits, resizing and retiming. */
export function getDescentView(recipe: Recipe): DescentView | null {
  const keys = recipe.cameraMotion?.keys;
  if (recipe.scene !== "stage" || keys?.length !== DESCENT_PATH.length)
    return null;
  const identities = keys.map((key) => keyIdentity(key.id));
  const view = identities[0]?.view;
  return view &&
    identities.every((id) => id?.view === view) &&
    new Set(identities.map((id) => id?.index)).size === DESCENT_PATH.length
    ? view
    : null;
}

/** Fresh original follow positions, with one explicit wide-angle starting lens. */
export function descentFollowCameraKeys(): SceneCameraKey[] {
  return DESCENT_PATH.map(([frame, y, z, aim], index) => ({
    id: `descent-camera-${index + 1}`,
    frame,
    position: [0, y, z],
    target: [0, aim, 0],
    fov: 75,
    easing: "linear",
  }));
}

/**
 * A reversible offset between the two saved views, in the current scene's metres.
 * Authored edits, Y travel, event timing, lenses and audio remain on their keys.
 * First-person hides the complete character from RGB/depth without deleting its
 * placement, path or clip sequence; Follow restores that same character.
 */
export function withDescentView(input: Recipe, view: DescentView): Recipe {
  const recipe = validateRecipe(input),
    current = getDescentView(recipe);
  if (!current || (view !== "first-person" && view !== "follow"))
    throw new Error("Choose an Endless descent camera view.");
  const factor = recipe.sceneSize?.factor ?? 1;
  const direction = current === view ? 0 : view === "first-person" ? 1 : -1;
  const compact = (value: number) => Math.round(value * 1e6) / 1e6;
  return validateRecipe({
    ...recipe,
    avatar: view === "follow",
    cameraMotion: {
      ...recipe.cameraMotion!,
      enabled: true,
      base: "keys",
      keys: recipe.cameraMotion!.keys.map((key) => {
        if (!direction) return key;
        const { index } = keyIdentity(key.id)!;
        const [, , followZ, followLookY, downLookY, downLookZ] =
          DESCENT_PATH[index];
        const shiftZ = compact(followZ * factor);
        const shiftAim =
          compact(downLookY * factor) - compact(followLookY * factor);
        return {
          ...key,
          id: `descent-${view === "first-person" ? "pov-" : ""}camera-${index + 1}`,
          position: [
            key.position[0],
            key.position[1],
            compact(key.position[2] - direction * shiftZ),
          ],
          target: [
            key.target[0],
            compact(key.target[1] + direction * shiftAim),
            compact(key.target[2] + direction * compact(downLookZ * factor)),
          ],
        };
      }),
    },
  });
}
