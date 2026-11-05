import {
  addTrack,
  aliasAsset,
  placeAsset,
  placeTrack,
  removeAsset,
} from "./assets";
import { missingTrack } from "./track-slot";
import { importInspectedAsset } from "./import-asset";
import type { Asset, Project } from "./types";
import type { ProjectMediaCommand } from "../project-media-command";

/** The same placement rules as the browser's use-asset/replace commands. */
export function placeMedia(
  project: Project,
  assetId: string,
  layerIds: string[],
  aliasId: string,
) {
  const missing = missingTrack(project);
  const audio = layerIds.filter(
    (id) =>
      id === missing?.id ||
      project.layers.find((layer) => layer.id === id)?.kind === "audio",
  );
  if (!audio.length) return placeAsset(project, assetId, layerIds, aliasId);
  if (layerIds.length !== 1)
    throw new Error("A track replaces one audio layer");
  return missing?.id === layerIds[0]
    ? addTrack(project, assetId, missing, missing.below, aliasId)
    : placeTrack(project, assetId, layerIds[0], aliasId);
}

export function applyMediaOperation(
  source: Project,
  command: ProjectMediaCommand,
  freshId: string,
  imported?: { id: string; asset: Asset },
) {
  let project = structuredClone(source);
  let assetIds: string[],
    layerIds: string[] = [];
  if (command.op === "attach" || command.op === "replace") {
    if (!imported) throw new Error("Stage the media first.");
    const result = importInspectedAsset(
      project,
      imported.id,
      imported.asset,
      command.op === "attach" ? command.use : "production",
    );
    assetIds = [result.assetId];
    if (command.op === "replace") {
      layerIds = command.layerIds;
      project = placeMedia(project, result.assetId, layerIds, freshId);
    }
  } else if (command.op === "relink") {
    layerIds = command.layerIds;
    project = placeMedia(project, command.assetId, layerIds, freshId);
    assetIds = [
      ...new Set(
        project.layers
          .filter((layer) => layerIds.includes(layer.id) && "assetId" in layer)
          .map((layer) => (layer as { assetId: string }).assetId),
      ),
    ];
  } else if (command.op === "alias") {
    assetIds = [aliasAsset(project, command.assetId, command.use, freshId)];
  } else {
    project = removeAsset(project, command.assetId);
    assetIds = [command.assetId];
  }
  project.revision = source.revision + 1;
  return { project, assetIds, layerIds };
}
