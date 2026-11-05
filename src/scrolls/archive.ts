import { strToU8, unzipSync, zipSync } from "fflate";
import {
  parseScroll,
  SCROLLS_LIMIT,
  type ScrollDocument,
} from "../../shared/scrolls/types";
import {
  MAX_BUNDLE_BYTES,
  validateScrollFiles,
  type ScrollBundle,
} from "./files";

export async function parseScrollArchive(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<ScrollBundle> {
  if (bytes.length > MAX_BUNDLE_BYTES)
    throw new Error("Scrolls bundle exceeds 100 MB.");
  let total = 0,
    count = 0;
  const seen = new Set<string>();
  const raw = unzipSync(bytes, {
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
/** The JSON is portable metadata; its referenced media still needs a bundle. */
export function scrollJsonBytes(document: ScrollDocument) {
  const bytes = strToU8(JSON.stringify(parseScroll(document), null, 2));
  if (bytes.length > SCROLLS_LIMIT)
    throw new Error("Scrolls JSON exceeds 64 KB.");
  return bytes;
}
export async function scrollArchiveBytes(bundle: ScrollBundle) {
  const snapshot: ScrollBundle = {
    document: structuredClone(bundle.document),
    files: new Map(),
  };
  for (const asset of snapshot.document.assets) {
    const bytes = bundle.files.get(asset.file.path);
    if (!bytes) throw new Error(`Missing media: ${asset.name}`);
    snapshot.files.set(asset.file.path, new Uint8Array(bytes));
  }
  await validateScrollFiles(snapshot);
  const files: Record<string, Uint8Array> = {
    "scroll.json": scrollJsonBytes(snapshot.document),
  };
  for (const [path, bytes] of snapshot.files) files[path] = bytes;
  const zip = new Uint8Array(zipSync(files, { level: 0 }));
  if (zip.length > MAX_BUNDLE_BYTES)
    throw new Error("Scrolls bundle exceeds 100 MB.");
  return zip;
}
