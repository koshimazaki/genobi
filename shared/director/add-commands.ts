// Adding media and recipe layers, plus the shared lane/length checks.
import type { DirectorCommand } from "./commands";
import { graphicParameters, recipeFor } from "./graphic-commands";
import { refuse } from "./layer-commands";
import { laneId, lanes, trackFamily } from "./tracks";
import { LAYER_LIMIT, type Layer, type Project } from "./types";

export function fits(project: Project, start: number, duration: number) {
  if (start + duration > project.composition.durationFrames)
    refuse(
      `The clip would end after the project's ${project.composition.durationFrames} frames`,
    );
}
/** An existing lane that takes this kind of clip. */
export function lane(project: Project, id: string, kind: Layer["kind"]) {
  const found = lanes(project.layers).find((l) => l.id === id);
  if (!found) return refuse(`No track ${id} in this project`);
  if (found.family !== trackFamily(kind))
    refuse(`Track ${id} holds ${found.family} clips, not ${kind}`);
  return found;
}

const still = {
  opacity: 1,
  position: { x: 0, y: 0 },
  scale: 1,
  rotationDegrees: 0,
};

export function addLayer(
  from: Project,
  c: Extract<DirectorCommand, { op: "add-clip" | "add-graphic" }>,
): Project {
  let project = from;
  if (project.layers.length >= LAYER_LIMIT)
    refuse(`A project holds at most ${LAYER_LIMIT} layers`);
  const taken = project.layers.some(
    (l) => l.id === c.layerId || laneId(l) === c.layerId,
  );
  if (taken) refuse(`Layer id ${c.layerId} is taken`);
  fits(project, c.startFrame, c.durationFrames);
  const base = {
    id: c.layerId,
    name: c.name ?? c.layerId,
    startFrame: c.startFrame,
    durationFrames: c.durationFrames,
    locked: false,
  };
  let layer: Layer;
  if (c.op === "add-clip") {
    const asset = project.assets[c.assetId];
    if (!asset) return refuse(`No asset ${c.assetId} in this project`);
    if (asset.use !== "production")
      refuse(`${c.assetId} is a reference; place a production asset`);
    if (asset.kind === "image" && c.sourceStartFrame !== undefined)
      refuse(`${c.assetId} is a still image; it has no in-point`);
    const sourceStartFrame = c.sourceStartFrame ?? 0;
    layer =
      asset.kind === "audio"
        ? {
            ...base,
            kind: "audio",
            assetId: c.assetId,
            sourceStartFrame,
            gain: 1,
          }
        : asset.kind === "video"
          ? {
              ...base,
              kind: "video",
              assetId: c.assetId,
              sourceStartFrame,
              fit: "contain",
              ...still,
            }
          : {
              ...base,
              kind: "image",
              assetId: c.assetId,
              fit: "contain",
              ...still,
            };
  } else {
    // A recipe no layer uses yet, even one from the registry, takes the
    // parameters given; otherwise they go over a using layer's settings.
    const recipe = recipeFor(project, c.moduleId);
    project = recipe.project;
    const { module } = recipe;
    const model = project.layers.find(
      (l) => "moduleId" in l && l.moduleId === c.moduleId,
    );
    const parameters = graphicParameters(
      c.moduleId,
      module,
      model && "parameters" in model ? model.parameters : undefined,
      c.parameters,
    );
    layer =
      module.mode === "filter"
        ? {
            ...base,
            kind: "filter",
            moduleId: c.moduleId,
            parameters,
            input: "composite-below",
          }
        : {
            ...base,
            kind: "graphics",
            moduleId: c.moduleId,
            parameters,
            ...still,
          };
  }
  const layers = [...project.layers];
  let at: number;
  if (c.track === "new") {
    // Media sits under the graphics, graphics under the filters.
    const above =
      layer.kind === "filter"
        ? -1
        : layers.findIndex((l) =>
            layer.kind === "graphics"
              ? l.kind === "filter"
              : l.kind === "graphics" || l.kind === "filter",
          );
    at = above < 0 ? layers.length : above;
  } else {
    lane(project, c.track, layer.kind);
    layer = { ...layer, track: c.track };
    at = layers.reduce((end, l, i) => (laneId(l) === c.track ? i + 1 : end), 0);
  }
  layers.splice(at, 0, layer);
  return { ...project, layers };
}
