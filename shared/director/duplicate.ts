import {
  checkReferences,
  LAYER_LIMIT,
  type Layer,
  type Project,
} from "./types";

/**
 * A copy of a clip as a new layer on its own lane, at the top of the stack:
 * the same media or recipe, timing, placement, prompt and directions, under
 * a new id. Unlocked, so the copy can be edited at once.
 */
export function duplicateLayer(p: Project, id: string, newId: string): Project {
  const layer = p.layers.find((l) => l.id === id);
  if (!layer) throw new Error("Layer not found");
  if (p.layers.some((l) => l.id === newId || (l.track ?? l.id) === newId))
    throw new Error(`Layer id ${newId} is taken`);
  if (p.layers.length >= LAYER_LIMIT)
    throw new Error(`A project supports at most ${LAYER_LIMIT} layers`);
  const { track: _track, ...source } = structuredClone(layer);
  const copy = {
    ...source,
    id: newId,
    name: `${layer.name.slice(0, 110)} copy`,
    locked: false,
  } as Layer;
  const next = { ...p, layers: [...p.layers, copy] };
  checkReferences(next);
  return next;
}
