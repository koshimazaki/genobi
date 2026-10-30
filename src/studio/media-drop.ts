import type { Bundle } from "../director/bundle";
import { PROJECT_ASSET_DRAG, readAssetDrag } from "../director/asset-drag";
import type { EditorAssets } from "../dual-editor/useEditorAssets";
export const LIBRARY_ASSET_DRAG = "application/x-director-video";
export function acceptsStudioMedia(types: readonly string[]) {
  return (
    types.includes("Files") ||
    types.includes(PROJECT_ASSET_DRAG) ||
    types.includes(LIBRARY_ASSET_DRAG)
  );
}
export function projectAssetFile(bundle: Bundle, assetId: string) {
  const asset = Object.hasOwn(bundle.project.assets, assetId)
    ? bundle.project.assets[assetId]
    : undefined;
  if (!asset) throw new Error("This asset is no longer in the project.");
  const bytes = bundle.files.get(asset.file.path);
  if (!bytes) throw new Error("This asset's file is missing.");
  const name = asset.file.path.split("/").at(-1)!;
  const ext = name.split(".").at(-1)?.toLowerCase() ?? "";
  const mime: Record<string, string> = {
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    flac: "audio/flac",
  };
  return new File([bytes], name, {
    type: mime[ext] ?? `${asset.kind}/octet-stream`,
  });
}
/** Read protected drag identity synchronously; resolve only known local sources. */
export async function studioDropFile(
  transfer: DataTransfer,
  bundle?: Bundle,
  library?: EditorAssets,
) {
  if (transfer.types.includes(PROJECT_ASSET_DRAG)) {
    if (!bundle) throw new Error("Open a project first.");
    return projectAssetFile(bundle, readAssetDrag(transfer, bundle).assetId);
  }
  const libraryId = transfer.getData(LIBRARY_ASSET_DRAG);
  if (libraryId) {
    if (!library) throw new Error("Open this asset from the library.");
    return library.resolve(libraryId);
  }
  return transfer.files[0];
}
/**
 * Every file a drop carries: a project asset or library item dragged from
 * the asset rail (read synchronously, resolved after), or files from disk.
 */
export async function studioDropFiles(
  transfer: DataTransfer,
  bundle?: Bundle,
  library?: EditorAssets,
): Promise<File[]> {
  if (
    transfer.types.includes(PROJECT_ASSET_DRAG) ||
    transfer.types.includes(LIBRARY_ASSET_DRAG)
  ) {
    const file = await studioDropFile(transfer, bundle, library);
    return file ? [file] : [];
  }
  return Array.from(transfer.files);
}
