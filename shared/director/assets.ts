import { laneId, laneNeighbours } from "./tracks";
import { recipeAssetIds } from "./recipe-assets";
import {
  checkReferences,
  LAYER_LIMIT,
  MEDIA_DURATION_EPSILON_SECONDS,
  type Project,
  type Asset,
  type Layer,
} from "./types";

export function assetUses(project: Project, id: string): string[] {
  return [
    ...project.layers
      .filter((l) => "assetId" in l && l.assetId === id)
      .map((l) => l.name),
    ...project.layers
      .filter((l) => recipeAssetIds(project, l).includes(id))
      .map((l) => l.name),
    ...project.generationPlans
      .filter(
        (g) => g.replaceAssetId === id || g.referenceAssetIds.includes(id),
      )
      .map((g) => `Plan ${g.id}`),
    ...project.generations
      .filter((g) =>
        [
          ...g.inputAssetIds,
          ...g.referenceAssetIds,
          ...g.outputAssetIds,
        ].includes(id),
      )
      .map((g) => `Generation ${g.id}`),
  ];
}
export function aliasAsset(
  project: Project,
  id: string,
  use: Asset["use"],
  newId: string,
) {
  const original = project.assets[id];
  if (!original) throw new Error("Unknown asset");
  const existing = Object.entries(project.assets).find(
    ([, a]) =>
      a.use === use &&
      a.kind === original.kind &&
      a.file.path === original.file.path &&
      a.file.sha256 === original.file.sha256,
  );
  if (existing) return existing[0];
  project.assets[newId] = { ...original, use, file: { ...original.file } };
  if (original.origin === "generated") {
    const generation = project.generations.find(
      (g) => g.id === original.generationId,
    );
    if (!generation) throw new Error("Missing generation provenance");
    generation.outputAssetIds.push(newId);
  }
  return newId;
}
export function placeAsset(
  project: Project,
  id: string,
  layerIds: string[],
  aliasId: string,
): Project {
  const p = structuredClone(project),
    source = p.assets[id];
  if (!source) throw new Error("Unknown asset");
  if (!layerIds.length || new Set(layerIds).size !== layerIds.length)
    throw new Error("Choose distinct target layers");
  const targets = layerIds.map((id) => p.layers.find((l) => l.id === id));
  if (targets.some((l) => !l || l.locked || !("assetId" in l)))
    throw new Error("Choose unlocked media layers");
  if (targets.some((l) => (l!.kind === "audio") !== (source.kind === "audio")))
    throw new Error("Choose compatible media layers");
  const assetId =
    source.use === "production" ? id : aliasAsset(p, id, "production", aliasId);
  p.layers = p.layers.map((l) => {
    if (!layerIds.includes(l.id)) return l;
    const next = { ...l, kind: source.kind, assetId } as Layer;
    if (next.kind === "video" || next.kind === "audio")
      next.sourceStartFrame = 0;
    else delete (next as unknown as Record<string, unknown>).sourceStartFrame;
    return next;
  });
  p.revision++;
  checkReferences(p);
  return p;
}
/**
 * Point one audio layer at an audio asset: the Director's Track slot, and a
 * project asset used on an audio layer. A reference gets a production alias,
 * as `placeAsset` gives one. The layer keeps its start and plays the new file
 * from its first frame, for the file's length, cut at the composition's end
 * and at the next clip on its lane, so a shorter or longer track fits.
 */
export function placeTrack(
  project: Project,
  id: string,
  layerId: string,
  aliasId: string,
): Project {
  const p = structuredClone(project),
    source = p.assets[id];
  if (!source) throw new Error("Unknown asset");
  if (source.kind !== "audio")
    throw new Error("A track takes WAV, MP3 or FLAC audio");
  const layer = p.layers.find((l) => l.id === layerId);
  if (!layer || layer.kind !== "audio")
    throw new Error("Choose an audio layer");
  if (layer.locked) throw new Error(`Unlock ${layer.name} to replace it`);
  const assetId =
    source.use === "production" ? id : aliasAsset(p, id, "production", aliasId);
  const { fps, durationFrames } = p.composition;
  // The same tolerance `checkReferences` allows for a rounded duration.
  const fileFrames = Math.floor(
    ((p.assets[assetId].durationSeconds ?? 0) +
      MEDIA_DURATION_EPSILON_SECONDS) *
      fps,
  );
  const { after } = laneNeighbours(p.layers, layer);
  const frames = Math.min(
    fileFrames,
    durationFrames - layer.startFrame,
    after - layer.startFrame,
  );
  if (frames < 1) throw new Error("The track is shorter than one frame");
  p.layers = p.layers.map((l) =>
    l.id === layerId
      ? { ...layer, assetId, sourceStartFrame: 0, durationFrames: frames }
      : l,
  );
  p.revision++;
  checkReferences(p);
  return p;
}
/**
 * Add a missing audio lane and place an audio asset on it: a template's
 * declared track that opened without one. The layer is built as the house
 * template builds it (unlocked, gain 1, from frame 0), stacked below the
 * first layer on any lane in `below`, then sized by `placeTrack`.
 */
export function addTrack(
  project: Project,
  id: string,
  lane: { id: string; name: string },
  below: string[],
  aliasId: string,
): Project {
  if (project.layers.some((l) => l.id === lane.id || laneId(l) === lane.id))
    throw new Error(`Layer id ${lane.id} is taken`);
  if (project.layers.length >= LAYER_LIMIT)
    throw new Error(`A project holds at most ${LAYER_LIMIT} layers`);
  if (project.assets[id]?.kind !== "audio")
    throw new Error("A track takes WAV, MP3 or FLAC audio");
  const layers = [...project.layers];
  const at = layers.findIndex((l) => below.includes(laneId(l)));
  layers.splice(at < 0 ? layers.length : at, 0, {
    id: lane.id,
    name: lane.name,
    kind: "audio",
    assetId: id,
    sourceStartFrame: 0,
    gain: 1,
    startFrame: 0,
    durationFrames: 1,
    locked: false,
  });
  // `placeTrack` checks the whole project once the layer has its length.
  return placeTrack({ ...project, layers }, id, lane.id, aliasId);
}
export function removeAsset(project: Project, id: string): Project {
  if (!project.assets[id]) throw new Error("Unknown asset");
  if (assetUses(project, id).length)
    throw new Error("Asset is in use. Replace its uses before removing it.");
  const p = structuredClone(project);
  delete p.assets[id];
  p.revision++;
  return p;
}
