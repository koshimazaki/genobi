import { inspectAudio, MAX_AUDIO_BYTES } from "./audio";
import { inspectImage, MAX_IMAGE_BYTES } from "./image";
import { checkUpscaleLimits, inspectMp4, MAX_INPUT_BYTES } from "./mp4";
import type { Source } from "./types";

/**
 * What `POST /api/uploads` takes, on both adapters. The declared type picks
 * the reader; the bytes must then prove it, so a stored file's type is one
 * its own header confirmed, never only the request's word.
 */
export type UploadKind = "video" | "image" | "audio";
export interface UploadType {
  kind: UploadKind;
  /** The canonical type the bytes must match and the file is served as. */
  contentType: string;
}

const DECLARED = new Map<string, UploadType>([
  ["video/mp4", { kind: "video", contentType: "video/mp4" }],
  ["image/png", { kind: "image", contentType: "image/png" }],
  ["image/jpeg", { kind: "image", contentType: "image/jpeg" }],
  ["image/webp", { kind: "image", contentType: "image/webp" }],
  ...["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"].map(
    (type) =>
      [type, { kind: "audio", contentType: "audio/wav" }] as [
        string,
        UploadType,
      ],
  ),
  ["audio/mpeg", { kind: "audio", contentType: "audio/mpeg" }],
  ["audio/mp3", { kind: "audio", contentType: "audio/mpeg" }],
  ["audio/flac", { kind: "audio", contentType: "audio/flac" }],
  ["audio/x-flac", { kind: "audio", contentType: "audio/flac" }],
]);

export const UPLOAD_TYPES = [...DECLARED.keys()];
export const UPLOAD_MESSAGE =
  "Upload an MP4, a PNG, JPEG or WebP image, or WAV, FLAC or MP3 audio.";
export const UPLOAD_LIMITS: Record<UploadKind, number> = {
  video: MAX_INPUT_BYTES,
  image: MAX_IMAGE_BYTES,
  audio: MAX_AUDIO_BYTES,
};
/** Stored object suffixes; `.mp4` and `.image` predate audio. */
export const UPLOAD_SUFFIX: Record<UploadKind, string> = {
  video: "mp4",
  image: "image",
  audio: "audio",
};
export const UPLOAD_LABEL: Record<UploadKind, string> = {
  video: "Uploaded clip",
  image: "Uploaded image",
  audio: "Uploaded audio",
};

export const uploadType = (header: string | null | undefined) =>
  DECLARED.get((header ?? "").split(";")[0].trim().toLowerCase());

export const MISMATCH_MESSAGE = "The file's contents do not match its type.";

/**
 * One reader for every upload, on both adapters: an MP4 keeps the upscale
 * ceilings it always had, an image is read whole (it is small), audio by
 * ranges. Throws a plain Error with a visitor-facing message.
 */
export async function inspectUpload(
  type: UploadType,
  size: number,
  read: (offset: number, length: number) => Promise<ArrayBuffer>,
  /** A video's longest length: one upscale's 20 s unless the adapter can split. */
  videoSeconds?: number,
): Promise<Pick<Source, "width" | "height" | "duration" | "contentType">> {
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > UPLOAD_LIMITS[type.kind]
  )
    throw new Error("The upload is too large.");
  if (type.kind === "video")
    return checkUpscaleLimits(await inspectMp4(size, read), size, videoSeconds);
  const found =
    type.kind === "image"
      ? inspectImage(new Uint8Array(await read(0, size)))
      : await inspectAudio(size, read);
  if (found.contentType !== type.contentType) throw new Error(MISMATCH_MESSAGE);
  return found;
}
