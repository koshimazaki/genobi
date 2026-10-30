import type { Bundle } from "./bundle";

/** Internal drags carry identity, not bytes or paths. Validate against this draft. */
export const PROJECT_ASSET_DRAG = "application/x-genobi-project-asset";
export function writeAssetDrag(
  transfer: DataTransfer,
  bundle: Bundle,
  assetId: string,
) {
  const asset = Object.hasOwn(bundle.project.assets, assetId)
    ? bundle.project.assets[assetId]
    : undefined;
  if (!asset) return;
  transfer.effectAllowed = "copy";
  transfer.setData(
    PROJECT_ASSET_DRAG,
    JSON.stringify({
      projectId: bundle.project.id,
      assetId,
      sha256: asset.file.sha256,
    }),
  );
}
export function readAssetDrag(
  transfer: Pick<DataTransfer, "getData">,
  bundle: Bundle,
) {
  const raw = transfer.getData(PROJECT_ASSET_DRAG);
  if (!raw || raw.length > 512)
    throw new Error("Drag an asset from this project.");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("That asset could not be read.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("That asset could not be read.");
  const { projectId, assetId, sha256 } = value as Record<string, unknown>;
  if (
    projectId !== bundle.project.id ||
    typeof assetId !== "string" ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(assetId) ||
    typeof sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(sha256)
  )
    throw new Error("Use an asset from the current project.");
  const asset = Object.hasOwn(bundle.project.assets, assetId)
    ? bundle.project.assets[assetId]
    : undefined;
  if (!asset || asset.file.sha256 !== sha256)
    throw new Error("That asset changed. Drag it from the project again.");
  return { assetId, asset };
}
