/**
 * The one rule for an output added to a project's assets: a 3D take or first
 * frame, a Dual Swords frame, a rendered, imported or saved video, a gallery
 * result. The studio's helper (`src/studio/project-assets.ts`) calls
 * `checkAssetMedia` before a byte is kept; it is portable, so a server-side
 * path can apply the same rule. This checks the declared type only; the bytes
 * are proven afterwards by the Director's importer, which decodes an image
 * and demuxes an MP4 or reads an audio file's duration (`import-media.ts`),
 * not by matching magic numbers.
 */
import { DIRECTOR_MEDIA_BYTES, DIRECTOR_MEDIA_LIMIT } from "./types";

export type AssetKind = "image" | "video" | "audio";
export type AssetUse = "production" | "reference";

/** Canonical content type → kind and the one extension it is stored with. */
export const ASSET_MEDIA_TYPES: Readonly<
  Record<string, { kind: AssetKind; extension: string }>
> = {
  "image/png": { kind: "image", extension: "png" },
  "image/jpeg": { kind: "image", extension: "jpg" },
  "image/webp": { kind: "image", extension: "webp" },
  "video/mp4": { kind: "video", extension: "mp4" },
  "audio/wav": { kind: "audio", extension: "wav" },
  "audio/mpeg": { kind: "audio", extension: "mp3" },
  "audio/flac": { kind: "audio", extension: "flac" },
};

export const ASSET_MEDIA_MESSAGE =
  "Add a PNG, JPEG or WebP image, an MP4 video, or WAV, MP3 or FLAC audio.";
export const ASSET_NAME_LENGTH = 100;

/** The canonical type for a declared one (`image/png; x=1`, `audio/x-wav`). */
export function assetContentType(declared: unknown): string | undefined {
  if (typeof declared !== "string") return undefined;
  const type = declared.split(";")[0].trim().toLowerCase();
  const alias: Record<string, string> = {
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/vnd.wave": "audio/wav",
    "audio/mp3": "audio/mpeg",
    "audio/x-flac": "audio/flac",
  };
  const canonical = alias[type] ?? type;
  return Object.hasOwn(ASSET_MEDIA_TYPES, canonical) ? canonical : undefined;
}

/**
 * A display filename: control characters (`\x00-\x1f\x7f`) and any folder
 * part removed, trimmed, at most 100 characters, ending in the extension the
 * content type is stored with (a wrong or missing one is replaced).
 */
export function assetMediaName(name: unknown, contentType: string): string {
  const { extension } = ASSET_MEDIA_TYPES[contentType];
  const plain = (typeof name === "string" ? name : "")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .split(/[\\/]/)
    .at(-1)!
    .trim();
  // A name that is only an extension (".mp4") has no stem of its own.
  const dot = plain.lastIndexOf(".");
  const stem = (dot >= 0 ? plain.slice(0, dot) : plain).trim() || "media";
  return `${stem.slice(0, ASSET_NAME_LENGTH - extension.length - 1)}.${extension}`;
}

export interface AssetMediaCheck {
  kind: AssetKind;
  contentType: string;
  filename: string;
  use: AssetUse;
}

/**
 * Validate an output before it is added: a known type, a size from one byte
 * to the Director's media limit, a use of `production` or `reference`, and a
 * cleaned filename. Throws a plain Error with a visitor-facing message.
 */
export function checkAssetMedia(input: {
  filename: unknown;
  contentType: unknown;
  size: unknown;
  use?: unknown;
}): AssetMediaCheck {
  const contentType = assetContentType(input.contentType);
  if (!contentType) throw new Error(ASSET_MEDIA_MESSAGE);
  const size = input.size;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0)
    throw new Error("The file is empty.");
  if (size > DIRECTOR_MEDIA_BYTES)
    throw new Error(`Project media must be under ${DIRECTOR_MEDIA_LIMIT}.`);
  const use = input.use ?? "production";
  if (use !== "production" && use !== "reference")
    throw new Error("Choose production or reference.");
  return {
    kind: ASSET_MEDIA_TYPES[contentType].kind,
    contentType,
    filename: assetMediaName(input.filename, contentType),
    use,
  };
}

/**
 * The name an asset was added under, as its label: the importer keeps a file
 * as `media/<asset id>/<name>.<ext>`, the name cut to 60 letters, digits,
 * hyphens or underscores (`src/director/import-media.ts`), so a take sent as
 * `fall-wide.mp4` reads `fall-wide`. A file named by its id (a take handed in
 * by an agent) has none.
 */
export function assetLabel(path: string): string | null {
  return (
    /^media\/[^/]+\/([A-Za-z0-9_-]{1,60})\.[a-z0-9]+$/.exec(path)?.[1] ?? null
  );
}
