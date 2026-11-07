import {
  parseScroll,
  SCROLLS_LIMIT,
  type AssetRole,
  type ScrollAsset,
  type ScrollDocument,
  type ScrollGeneration,
} from "../../shared/scrolls/types";
import { applyScrollCommand } from "../../shared/scrolls/commands";
import { digest, download } from "../director/bundle";
import {
  MAX_BUNDLE_BYTES,
  TYPES,
  measure,
  validateScrollFiles,
  type ScrollBundle,
} from "./files";
import {
  parseScrollArchive,
  scrollArchiveBytes,
  scrollJsonBytes,
} from "./archive";
export {
  MAX_BUNDLE_BYTES,
  assetType,
  validateScrollFiles,
  type ScrollBundle,
} from "./files";

export async function addFile(
  bundle: ScrollBundle,
  file: File,
  role: AssetRole,
  cellId?: string,
  prompt?: string,
  generation?: ScrollGeneration,
): Promise<ScrollBundle> {
  const kind = role === "audio" ? "audio" : "image";
  if (file.size > (kind === "image" ? 32 : 50) * 1024 * 1024)
    throw new Error("Media exceeds its size limit.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const measured = await measure(bytes, kind);
  const ext = Object.keys(TYPES).find(
    (k) => TYPES[k] === measured.contentType,
  )!;
  const assetId = `asset-${crypto.randomUUID()}`;
  const asset: ScrollAsset = {
    id: assetId,
    // Strip filename control characters before display.
    // eslint-disable-next-line no-control-regex
    name: file.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 120),
    role,
    kind,
    origin: prompt ? "generated" : "uploaded",
    file: { path: `media/${assetId}.${ext}`, sha256: await digest(bytes) },
    ...(kind === "audio" ? { durationSeconds: measured.duration } : {}),
    ...(cellId ? { cellId } : {}),
    ...(prompt ? { prompt } : {}),
    ...(prompt && generation ? { generation } : {}),
  };
  const document = applyScrollCommand(bundle.document, {
    op: "add-asset",
    revision: bundle.document.revision,
    asset,
  });
  const files = new Map(bundle.files).set(asset.file.path, bytes);
  return validateScrollFiles({ document, files });
}
export async function openScroll(
  file: File,
  current?: ScrollBundle,
): Promise<ScrollBundle> {
  if (file.size > MAX_BUNDLE_BYTES)
    throw new Error("Scrolls bundle exceeds 100 MB.");
  if (file.name.endsWith(".json")) {
    if (file.size > SCROLLS_LIMIT)
      throw new Error("Scrolls JSON exceeds 64 KB.");
    return validateScrollFiles({
      document: parseScroll(JSON.parse(await file.text())),
      files: current?.files ?? new Map(),
    });
  }
  return parseScrollArchive(new Uint8Array(await file.arrayBuffer()));
}
export async function saveScroll(bundle: ScrollBundle) {
  download(
    new Blob([await scrollArchiveBytes(bundle)], { type: "application/zip" }),
    `${bundle.document.id}.zip`,
  );
}
export function exportScrollJson(doc: ScrollDocument) {
  download(
    new Blob([scrollJsonBytes(doc)], { type: "application/json" }),
    `${doc.id}.json`,
  );
}
