import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { inspectAudio, MAX_AUDIO_BYTES } from "../shared/audio";
import type { GenobiApi } from "./api";

/**
 * A local audio file an agent names by path, sent to the studio as an upload
 * in the agent's own session. The MCP server runs on the same machine, reads
 * the file here and sends only its bytes: the path never reaches the studio,
 * a log or an error message. The shared reader checks the header first, so
 * only WAV, FLAC or MP3 with a readable duration is read in full.
 */
export const MAX_PATH_LENGTH = 4096;

/**
 * Each file's upload per studio session, keyed by its SHA-256. The entry is
 * the upload in flight, set before the POST, so concurrent calls for one
 * file share one upload and one source id; a failed upload is dropped.
 */
interface Upload {
  pending: Promise<string>;
  id?: string;
}
const uploaded = new WeakMap<GenobiApi, Map<string, Upload>>();

export class AudioFileError extends Error {}

const notAFile = () => new AudioFileError("filePath must name a regular file.");

/** Drops a source id the studio no longer has, so the next call re-sends. */
export function forgetAudioFile(api: GenobiApi, sourceId: string) {
  const known = uploaded.get(api);
  for (const [hash, upload] of known ?? [])
    if (upload.id === sourceId) known!.delete(hash);
}

export function checkAudioPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > MAX_PATH_LENGTH ||
    // Control characters are refused on purpose, as the server's sanitisers do.
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f\x7f]/.test(value) ||
    !path.isAbsolute(value)
  )
    throw new AudioFileError(
      "Give filePath as an absolute path to a WAV, FLAC or MP3 file.",
    );
  return value;
}

/** Reads, checks and uploads the file; returns its source id. */
export async function uploadAudioFile(api: GenobiApi, filePath: string) {
  let handle;
  try {
    // Symlinks resolve first, so the check below sees the target. A FIFO,
    // socket or device is refused before it is opened, because opening a
    // FIFO for reading waits for a writer; the open is non-blocking anyway,
    // and the handle is checked again in case the path changed in between.
    const target = await realpath(checkAudioPath(filePath));
    if (!(await lstat(target)).isFile()) throw notAFile();
    handle = await open(target, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (error) {
    if (error instanceof AudioFileError) throw error;
    throw new AudioFileError("That audio file could not be opened.");
  }
  let bytes: Uint8Array<ArrayBuffer>, contentType: string;
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw notAFile();
    if (info.size === 0 || info.size > MAX_AUDIO_BYTES)
      throw new AudioFileError(
        `Use an audio file of at most ${MAX_AUDIO_BYTES / 1_000_000} MB.`,
      );
    try {
      ({ contentType } = await inspectAudio(info.size, async (at, length) => {
        const part = new Uint8Array(length);
        const { bytesRead } = await handle!.read(part, 0, length, at);
        return part.buffer.slice(0, bytesRead);
      }));
    } catch (error) {
      // The shared reader's own words name no path.
      throw new AudioFileError(
        error instanceof Error ? error.message : "Unreadable audio.",
      );
    }
    bytes = new Uint8Array(info.size);
    const { bytesRead } = await handle.read(bytes, 0, info.size, 0);
    if (bytesRead !== info.size)
      throw new AudioFileError("The audio file changed while it was read.");
  } finally {
    await handle.close();
  }
  const hash = createHash("sha256").update(bytes).digest("hex");
  const known = uploaded.get(api) ?? new Map<string, Upload>();
  uploaded.set(api, known);
  const existing = known.get(hash);
  if (existing) return existing.pending;
  const upload: Upload = {
    pending: api
      .postBytes<{ source: { id: string } }>("/api/uploads", bytes, contentType)
      .then(({ source }) => (upload.id = source.id)),
  };
  known.set(hash, upload);
  upload.pending.catch(() => {
    if (known.get(hash) === upload) known.delete(hash);
  });
  return upload.pending;
}
