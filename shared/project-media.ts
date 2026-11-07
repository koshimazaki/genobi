import { DIRECTOR_PROJECT_BYTES } from "./director/types";
import type { UploadKind } from "./uploads";

/** Staging is temporary and local; attachment copies bytes into the project. */
export const PROJECT_MEDIA_STAGE_MS = 60 * 60_000;
export const PROJECT_MEDIA_STAGE_BYTES = 50_000_000;
export const PROJECT_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "audio/wav",
  "audio/flac",
  "audio/mpeg",
  "video/mp4",
] as const;
export const PROJECT_MEDIA_STAGE_TOTAL = DIRECTOR_PROJECT_BYTES;
export const PROJECT_MEDIA_STAGE_FILES = 128;
export const MEDIA_RECEIPT_ID = /^[a-f0-9]{64}$/;

export interface ProjectMediaReceipt {
  receiptId: string;
  copyId: string;
  sha256: string;
  byteLength: number;
  kind: UploadKind;
  contentType: string;
  width: number;
  height: number;
  duration: number;
  expiresAt: string;
}
