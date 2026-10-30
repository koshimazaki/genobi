import modules from "../../docs/director-bundle/version-media/modules.json";
import endCard from "../../docs/director-bundle/version-media/version-mix-end-card-still.mjs?raw";
import genImage from "../../docs/director-bundle/version-media/version-teaser-gen-image.mjs?raw";
import space from "../../docs/director-bundle/version-media/version-teaser-space.mjs?raw";
import registry from "../../docs/director-bundle/example/studio.json";
import type {
  GraphicsModule,
  Layer,
  Parameters,
} from "../../shared/director/types";
import { recipeAssetIds } from "../../shared/director/recipe-assets";
import { inspectImage } from "../../shared/image";
import type { VersionSlot } from "../../shared/templates/version";
import { versionCommand } from "../../shared/templates/version";
import type { Bundle } from "./bundle";

const sources = {
  "version-end-card-still": endCard,
  "version-gen-image": genImage,
  "version-space-hud": space,
};
const catalogue = modules as Record<string, GraphicsModule>;

/** Upgrade just this layer; older, hash-pinned recipes remain registered. */
export async function bindVersionPicture(
  bundle: Bundle,
  slot: VersionSlot,
  assetId: string,
): Promise<Bundle> {
  const target = slot.picture!;
  let project = structuredClone(bundle.project);
  const layer = project.layers.find((l) => l.id === target.layer);
  if (!layer || !("moduleId" in layer))
    throw new Error(`${slot.label}: the graphic was removed.`);
  if (layer.locked) throw new Error(`Unlock ${layer.name} first.`);
  const own = project.modules[layer.moduleId];
  const sourceId = Object.entries(registry.modules).find(
    ([, m]) => m.file.sha256 === own.file.sha256,
  )?.[0];
  const versionId = sourceId
    ? `version-${sourceId}`
    : Object.entries(catalogue).find(
        ([, m]) => m.file.sha256 === own.file.sha256,
      )?.[0];
  if (!versionId || !Object.hasOwn(sources, versionId))
    throw new Error(
      `${slot.label}: this recipe does not support project pictures.`,
    );
  const module = catalogue[versionId];
  const files = new Map(bundle.files);
  files.set(
    module.file.path,
    new TextEncoder().encode(sources[versionId as keyof typeof sources]),
  );
  project.modules[versionId] = module;
  project.layers = project.layers.map((l) =>
    l.id === layer.id ? { ...l, moduleId: versionId } : l,
  );
  project = versionCommand(project, project.revision, {
    op: "set-parameters",
    layerId: layer.id,
    parameters: { [target.parameter]: `asset:${assetId}` },
  });
  return { project, files };
}

/** Only bundle-owned images can become a blob URL, kept out of the manifest. */
export function versionPictureParameters(
  bundle: Bundle,
  layer: Layer,
  parameters: Parameters,
  keep: (url: string) => void,
): Parameters {
  const ids = recipeAssetIds(bundle.project, layer);
  return Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => {
      if (
        typeof value !== "string" ||
        !value.startsWith("asset:") ||
        !ids.includes(value.slice(6))
      )
        return [key, value];
      const asset = bundle.project.assets[value.slice(6)];
      const bytes = asset && bundle.files.get(asset.file.path);
      if (asset?.kind !== "image" || !bytes)
        throw new Error("The graphic's project image is missing.");
      const url = URL.createObjectURL(
        new Blob([bytes], { type: inspectImage(bytes).contentType }),
      );
      keep(url);
      return [key, url];
    }),
  );
}
