import { inspectImage } from "../../shared/image";
import { inspectAudio } from "../../shared/audio";
import {
  parseScroll,
  type ScrollAsset,
  type ScrollDocument,
} from "../../shared/scrolls/types";
import { digest } from "../director/file-hash";
export interface ScrollBundle {
  document: ScrollDocument;
  files: Map<string, Uint8Array<ArrayBuffer>>;
}
export const MAX_BUNDLE_BYTES = 100 * 1024 * 1024;
export const TYPES: Record<string, string> = {
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
export async function measure(
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
