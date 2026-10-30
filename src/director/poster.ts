import type { Asset } from "../../shared/director/types";
import { videoPoster } from "./video-source";

/**
 * Card thumbnails and video poster frames, drawn in the browser from the
 * bundle's own bytes. Requests run one at a time, results are cached by the
 * file's SHA-256 and source time, and the cache holds Blobs, never object
 * URLs: each card makes its own URL and revokes it when it unmounts.
 */
const LIMIT = 96;
const done = new Map<string, Blob | null>();
let queue: Promise<unknown> = Promise.resolve();

export const posterKey = (asset: Asset, seconds: number) =>
  asset.kind === "video"
    ? `${asset.file.sha256}@${seconds.toFixed(4)}`
    : asset.file.sha256;

function remember(key: string, blob: Blob | null) {
  done.delete(key);
  done.set(key, blob);
  while (done.size > LIMIT) done.delete(done.keys().next().value!);
}

/** Cached result, or undefined when the poster has not been drawn yet. */
export function cachedPoster(key: string) {
  if (!done.has(key)) return undefined;
  const blob = done.get(key)!;
  remember(key, blob);
  return blob;
}

/** Queue one draw; a request whose card has gone is skipped, not decoded. */
export function requestPoster(
  key: string,
  draw: () => Promise<Blob | null>,
  signal: AbortSignal,
): Promise<Blob | null | undefined> {
  const hit = cachedPoster(key);
  if (hit !== undefined) return Promise.resolve(hit);
  const task = queue.then(async () => {
    if (signal.aborted) return undefined;
    const again = cachedPoster(key);
    if (again !== undefined) return again;
    let blob: Blob | null = null;
    try {
      blob = await draw();
    } catch {
      /* A card stays usable without its poster; remember the miss. */
    }
    remember(key, blob);
    return blob;
  });
  queue = task.catch(() => {});
  return task;
}

function encode(canvas: HTMLCanvasElement | OffscreenCanvas) {
  if ("convertToBlob" in canvas)
    return canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82),
  );
}

async function imagePoster(bytes: Uint8Array<ArrayBuffer>) {
  const bitmap = await createImageBitmap(new Blob([bytes]));
  try {
    if (bitmap.width * bitmap.height > 16000000) return null;
    const canvas = document.createElement("canvas");
    const ratio = Math.min(240 / bitmap.width, 140 / bitmap.height, 1);
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return encode(canvas);
  } finally {
    bitmap.close();
  }
}

/** The draw for one asset: an image thumbnail or a video frame at `seconds`. */
export function drawPoster(
  asset: Asset,
  bytes: Uint8Array<ArrayBuffer>,
  seconds: number,
) {
  return async () => {
    if (asset.kind === "image") return imagePoster(bytes);
    if (asset.kind !== "video") return null;
    const canvas = await videoPoster(bytes, seconds);
    return canvas ? encode(canvas) : null;
  };
}
