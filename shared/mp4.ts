import { createFile, MP4BoxBuffer, type Movie } from "mp4box";
import type { Source } from "./types";
import { UPSCALE_MAX_SECONDS } from "./upscale-parts";

export type VideoMetadata = Pick<Source, "width" | "height" | "duration">;
export const MAX_INPUT_BYTES = 50_000_000;
const invalid = () =>
  new Error("Use a standard MP4 with a video track and readable duration.");

/** Inspect bounded metadata ranges, skipping media payloads even when moov is at the end. */
export async function inspectMp4(
  size: number,
  read: (offset: number, length: number) => Promise<ArrayBuffer>,
): Promise<VideoMetadata> {
  if (!Number.isSafeInteger(size) || size < 16) throw invalid();
  const parser = createFile(false);
  let movie: Movie | undefined;
  let failed = false;
  parser.onReady = (value) => {
    movie = value;
  };
  parser.onError = () => {
    failed = true;
  };
  let offset = 0;
  for (let count = 0; count < 32 && offset < size; count++) {
    const length = Math.min(128 * 1024, size - offset);
    const buffer = await read(offset, length);
    if (buffer.byteLength !== length) throw invalid();
    let next: number;
    try {
      next = parser.appendBuffer(
        MP4BoxBuffer.fromArrayBuffer(buffer, offset),
        offset + length === size,
      );
    } catch {
      throw invalid();
    }
    if (failed) throw invalid();
    if (movie) {
      const track = movie.videoTracks[0];
      // Fragmented streams may report only an initial segment's duration. Fail closed.
      if (movie.isFragmented || movie.videoTracks.length !== 1 || !track?.video)
        throw invalid();
      const width = track.video.width;
      const height = track.video.height;
      const duration = Math.max(
        movie.duration / movie.timescale,
        track.duration / track.timescale,
      );
      if (
        ![width, height, duration].every((n) => Number.isFinite(n) && n > 0) ||
        !Number.isInteger(width) ||
        !Number.isInteger(height)
      )
        throw invalid();
      return { width, height, duration };
    }
    if (!Number.isSafeInteger(next) || next < offset + length)
      next = offset + length;
    offset = next;
  }
  throw invalid();
}

/**
 * One upscale's source ceilings. `maxSeconds` is 20 for a run; the local
 * server's uploads pass the split ceiling (`UPSCALE_SPLIT_MAX_SECONDS`), since
 * it can cut a longer clip into parts (`shared/upscale-parts.ts`).
 */
export function checkUpscaleLimits(
  metadata: VideoMetadata,
  size: number,
  maxSeconds = UPSCALE_MAX_SECONDS,
) {
  const { width, height, duration } = metadata;
  if (
    size > MAX_INPUT_BYTES ||
    duration > maxSeconds ||
    width * height > 2560 * 1440 ||
    Math.max(width, height) > 2560
  )
    throw new Error(
      `Use an MP4 up to ${maxSeconds} seconds, 50 MB, and 2560 × 1440 pixels.`,
    );
  return metadata;
}
