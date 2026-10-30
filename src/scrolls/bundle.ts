import { strToU8, unzipSync, zipSync } from "fflate";
import { inspectImage } from "../../shared/image";
import { inspectAudio } from "../../shared/audio";
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
export interface ScrollBundle {
  document: ScrollDocument;
  files: Map<string, Uint8Array<ArrayBuffer>>;
}
export const MAX_BUNDLE_BYTES = 100 * 1024 * 1024;
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac",
};
export const assetType = (a: ScrollAsset) =>
  TYPES[a.file.path.split(".").pop()!] ?? "application/octet-stream";
async function measure(
  bytes: Uint8Array<ArrayBuffer>,
  kind: "image" | "audio",
) {
  if (
    !bytes.length ||
    bytes.length > (kind === "image" ? 32 : 50) * 1024 * 1024
  )
    throw new Error("Images must be under 32 MB; audio under 50 MB.");
  if (kind === "image") {
    const info = inspectImage(bytes);
    if (!info.width || !info.height || info.width * info.height > 16_000_000)
      throw new Error("Images must be within 16 megapixels.");
    return { ...info, duration: undefined };
  }
  return inspectAudio(
    bytes.length,
    async (offset, length) => bytes.slice(offset, offset + length).buffer,
  );
}
export async function validateScrollFiles(bundle: ScrollBundle) {
  parseScroll(bundle.document);
  let total = 0;
  for (const a of bundle.document.assets) {
    const bytes = bundle.files.get(a.file.path);
    if (!bytes || (await digest(bytes)) !== a.file.sha256)
      throw new Error(`Missing or changed media: ${a.name}`);
    total += bytes.length;
    if (total > MAX_BUNDLE_BYTES)
      throw new Error("Scrolls media exceeds 100 MB.");
    const measured = await measure(bytes, a.kind);
    if (measured.contentType !== assetType(a))
      throw new Error("Media bytes do not match the saved type.");
    if (
      a.kind === "audio" &&
      Math.abs(measured.duration! - a.durationSeconds!) > 0.02
    )
      throw new Error("Audio duration changed.");
  }
  return bundle;
}
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
  let total = 0,
    count = 0;
  const seen = new Set<string>();
  const raw = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(entry) {
      if (seen.has(entry.name))
        throw new Error("Duplicate file in Scrolls bundle.");
      seen.add(entry.name);
      total += entry.originalSize;
      if (total > MAX_BUNDLE_BYTES || ++count > 49)
        throw new Error("Unpacked Scrolls bundle exceeds its limits.");
      if (
        entry.name !== "scroll.json" &&
        !/^media\/[a-z][a-z0-9-]{0,63}\.(png|jpg|jpeg|webp|wav|flac|mp3)$/.test(
          entry.name,
        )
      )
        throw new Error("Unexpected file in Scrolls bundle.");
      if (entry.name === "scroll.json" && entry.originalSize > SCROLLS_LIMIT)
        throw new Error("Scrolls JSON exceeds 64 KB.");
      return true;
    },
  });
  if (!raw["scroll.json"])
    throw new Error("Choose a ZIP containing scroll.json.");
  const document = parseScroll(
    JSON.parse(new TextDecoder().decode(raw["scroll.json"])),
  );
  const paths = new Set(document.assets.map((a) => a.file.path));
  if (
    Object.keys(raw).some((path) => path !== "scroll.json" && !paths.has(path))
  )
    throw new Error("Bundle contains unreferenced media.");
  return validateScrollFiles({
    document,
    files: new Map(
      Object.entries(raw)
        .filter(([p]) => p !== "scroll.json")
        .map(([path, bytes]) => [path, new Uint8Array(bytes)]),
    ),
  });
}
export function saveScroll(bundle: ScrollBundle) {
  const files: Record<string, Uint8Array> = {
    "scroll.json": strToU8(JSON.stringify(bundle.document, null, 2)),
  };
  for (const a of bundle.document.assets) {
    const bytes = bundle.files.get(a.file.path);
    if (!bytes)
      throw new Error("An asset is missing. Reattach it before saving.");
    files[a.file.path] = bytes;
  }
  download(
    new Blob([new Uint8Array(zipSync(files, { level: 0 }))], {
      type: "application/zip",
    }),
    `${bundle.document.id}.zip`,
  );
}
export function exportScrollJson(doc: ScrollDocument) {
  download(
    new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
    `${doc.id}.json`,
  );
}
