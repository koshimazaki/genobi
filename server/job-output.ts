import { open, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import {
  inspectStoredAudio,
  MAX_AUDIO_BYTES,
  type AudioMetadata,
} from "../shared/audio";
import { inspectImage, isImage, MAX_IMAGE_RESULT_BYTES } from "../shared/image";
import { AUDIO_EXTENSION, isMusic } from "../shared/music";
import type { Source } from "../shared/types";
import { probeVideo, saveDownload } from "./media";
import type { StoredJob } from "./store";

export interface SavedResult {
  file: string;
  mediaType: "video" | "image" | "audio";
  metadata: Pick<Source, "width" | "height" | "duration"> & {
    contentType?: string;
  };
}

/**
 * Measure a stored song with the shared reader (`inspectStoredAudio`,
 * `shared/audio.ts`), by ranged reads: never ffprobe, whose answer is not the
 * one an upload or a hand-in would get (see `probeVideo`). Undefined when no
 * header states its length or format.
 */
export async function measureAudio(
  file: string,
  size: number,
): Promise<AudioMetadata | undefined> {
  const handle = await open(file, "r");
  try {
    return await inspectStoredAudio(size, async (offset, length) => {
      const bytes = new Uint8Array(length);
      const { bytesRead } = await handle.read(bytes, 0, length, offset);
      return bytes.buffer.slice(0, bytesRead);
    });
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
}

/**
 * The copy step of a finished run: the provider's file saved into the store
 * under the job's id, then measured by the shared readers. A video is `.mp4`,
 * a still `.image`; a song is saved as `.mp3`, `.wav` or `.flac`, whichever
 * its own header proves, so the stored name never trusts the provider's word.
 * A paid song is never thrown away or fetched again for want of a length: one
 * no header measures is kept as the MP3 the graph saves, with duration 0
 * (not measured), and served like any other.
 */
export async function saveResult(
  directory: string,
  job: Pick<StoredJob, "id" | "generator">,
  response: Response,
): Promise<SavedResult> {
  const media = path.join(directory, "media");
  if (isMusic(job.generator)) {
    const part = path.join(media, `${job.id}.audio-download`);
    await saveDownload(response, part, MAX_AUDIO_BYTES);
    const measured = await measureAudio(part, (await stat(part)).size);
    const metadata = measured ?? {
      width: 0,
      height: 0,
      duration: 0,
      contentType: "audio/mpeg" as const,
    };
    const file = path.join(
      media,
      `${job.id}.${AUDIO_EXTENSION[metadata.contentType]}`,
    );
    await rename(part, file);
    return { file, mediaType: "audio", metadata };
  }
  const image = isImage(job.generator);
  const file = path.join(media, `${job.id}.${image ? "image" : "mp4"}`);
  await saveDownload(
    response,
    file,
    image ? MAX_IMAGE_RESULT_BYTES : undefined,
  );
  return image
    ? {
        file,
        mediaType: "image",
        metadata: inspectImage(new Uint8Array(await readFile(file))),
      }
    : { file, mediaType: "video", metadata: await probeVideo(file) };
}
