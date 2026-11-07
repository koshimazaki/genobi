import type { Asset, Project } from "./types";

/** Shared by browser imports and inspected agent uploads; media inspection is the adapter's. */
export function importInspectedAsset(
  project: Project,
  id: string,
  asset: Asset,
  use: Asset["use"],
) {
  const duplicate = Object.entries(project.assets).find(
    ([, held]) =>
      held.kind === asset.kind &&
      held.use === use &&
      held.file.sha256 === asset.file.sha256,
  );
  if (duplicate)
    return { assetId: duplicate[0], asset: duplicate[1], added: false };
  if (Object.hasOwn(project.assets, id))
    throw new Error("The imported asset id is already used.");
  const shared = Object.values(project.assets).find(
    (held) => held.file.sha256 === asset.file.sha256,
  );
  const next: Asset = {
    ...asset,
    use,
    file: { ...(shared?.file ?? asset.file) },
  };
  project.assets[id] = next;
  return { assetId: id, asset: next, added: true };
}
