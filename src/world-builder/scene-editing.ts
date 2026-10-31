import type { Prop, Recipe } from "./recipe";
import { evaluateScene } from "./evaluate-scene";
import { sceneObjects, sceneTransformOf } from "./scene-state";

/** Build edits one authored state, never a modulated or interpolated pose. */
export function nearestSceneKey(recipe: Recipe, frame: number) {
  const keys = recipe.motion?.stateKeys ?? [];
  return keys.reduce(
    (best, key, i) =>
      Math.abs(key.frame - frame) < Math.abs(keys[best].frame - frame)
        ? i
        : best,
    0,
  );
}

export function sceneEditFrame(recipe: Recipe, frame: number) {
  return recipe.motion?.stateKeys[nearestSceneKey(recipe, frame)]?.frame ?? 0;
}

export function editableSceneObjects(recipe: Recipe, frame: number) {
  if (!recipe.motion) return recipe.objects;
  const ids = new Set(sceneObjects(recipe).map((p) => p.id));
  return evaluateScene(recipe, sceneEditFrame(recipe, frame), {
    editing: true,
  }).objects.filter((p) => ids.has(p.id));
}

/** Viewport transforms arrive as full objects; only changed IDs enter the key. */
export function sceneObjectEdits(
  recipe: Recipe,
  frame: number,
  objects: Prop[],
): Partial<Recipe> {
  if (!recipe.motion) return { objects };
  const index = nearestSceneKey(recipe, frame);
  const before = new Map(
    editableSceneObjects(recipe, frame).map((p) => [p.id, p]),
  );
  const key = recipe.motion.stateKeys[index];
  const transforms = { ...key.objects };
  const added = new Set<string>();
  for (const object of objects) {
    const original = before.get(object.id);
    if (!original) continue;
    const value = sceneTransformOf(object);
    if (JSON.stringify(value) !== JSON.stringify(sceneTransformOf(original))) {
      transforms[object.id] = value;
      if (!Object.hasOwn(key.objects, object.id)) added.add(object.id);
    }
  }
  return {
    motion: {
      ...recipe.motion,
      stateKeys: recipe.motion.stateKeys.map((k, i) =>
        i === index
          ? { ...k, objects: transforms }
          : {
              ...k,
              objects: {
                ...k.objects,
                ...Object.fromEntries(
                  [...added].map((id) => [
                    id,
                    sceneTransformOf(before.get(id)!),
                  ]),
                ),
              },
            },
      ),
    },
  };
}

/** The inspector and gizmo share the same key edit, including generated voxels. */
export function patchSceneObject(
  recipe: Recipe,
  frame: number,
  id: string,
  patch: Partial<Prop>,
): Partial<Recipe> {
  const objects = editableSceneObjects(recipe, frame).map((p) =>
    p.id === id ? { ...p, ...patch } : p,
  );
  if (!recipe.motion) return { objects };
  const edit = sceneObjectEdits(recipe, frame, objects);
  // Material identity belongs to the object, not an interpolated state.
  if (
    ["color", "prompt", "spin", "orbit", "orbitX", "orbitZ"].some(
      (key) => key in patch,
    )
  )
    edit.objects = recipe.objects.map((p) =>
      p.id === id
        ? {
            ...p,
            ...Object.fromEntries(
              Object.entries(patch).filter(([key]) =>
                [
                  "color",
                  "prompt",
                  "spin",
                  "orbit",
                  "orbitX",
                  "orbitZ",
                ].includes(key),
              ),
            ),
          }
        : p,
    );
  return edit;
}

export function sceneFrameAfterEdit(
  previous: Recipe,
  next: Recipe,
  frame: number,
) {
  const key = previous.motion?.stateKeys[nearestSceneKey(previous, frame)];
  return (
    next.motion?.stateKeys.find((k) => k.id === key?.id)?.frame ??
    sceneEditFrame(next, frame)
  );
}

export function removeSceneObject(recipe: Recipe, id: string) {
  if (!recipe.motion) return undefined;
  return {
    ...recipe.motion,
    stateKeys: recipe.motion.stateKeys.map((key) => ({
      ...key,
      objects: Object.fromEntries(
        Object.entries(key.objects).filter(([key]) => key !== id),
      ),
    })),
  };
}

/** A new primitive exists in every state; later edits can move it independently. */
export function withAddedSceneObject(recipe: Recipe, prop: Prop): Recipe {
  return {
    ...recipe,
    objects: [...recipe.objects, prop],
    ...(recipe.motion
      ? {
          motion: {
            ...recipe.motion,
            stateKeys: recipe.motion.stateKeys.map((key) => ({
              ...key,
              objects: { ...key.objects, [prop.id]: sceneTransformOf(prop) },
            })),
          },
        }
      : {}),
  };
}
