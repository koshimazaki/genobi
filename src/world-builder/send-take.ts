/**
 * Send to Director for one library take, shared by the card's button and
 * the paired agent's `send-to-project` command: the first frame under
 * Inspirations (a reference the Director's prompt takes) and the take under
 * Project as MP4, with its WAV, re-encoded in this browser (`take-mp4.ts`).
 * The files are named after the take, which the project's listing shows as
 * each asset's label. Nothing is generated or paid.
 */
import type { AddAsset, AddedAsset } from "../studio/project-assets";
import {
  DIRECTOR_MEDIA_BYTES,
  DIRECTOR_MEDIA_LIMIT,
} from "../../shared/director/types";
import { asTake, type LibraryTake } from "./take-library";
import type { Take } from "./export-take";

export interface SentAsset {
  assetId: string;
  /** False when the project already held the same bytes for this use. */
  added: boolean;
  use: AddedAsset["use"];
  filename: string;
}
export interface SentTake {
  take: { id: string; name: string };
  frame: SentAsset;
  video: SentAsset;
  audio: SentAsset | null;
}

type AddTake = (
  take: Take,
  size: { width: number; height: number },
) => Promise<{ video: AddedAsset; audio?: AddedAsset } | undefined>;

const sent = ({ assetId, added, use, filename }: AddedAsset): SentAsset => ({
  assetId,
  added,
  use,
  filename,
});

export const TOO_LARGE = `This take is too large for project assets (${DIRECTOR_MEDIA_LIMIT}). Download the WebM, or capture a shorter or smaller take.`;

/** A take by its id, else the newest take of that name (the list is newest first). */
export function findLibraryTake(takes: LibraryTake[], key: string) {
  const found =
    takes.find((t) => t.id === key) ?? takes.find((t) => t.name === key);
  if (!found)
    throw new Error(
      `No take named "${String(key).slice(0, 80)}" in the library. List the takes first.`,
    );
  return found;
}

export async function sendLibraryTake(
  take: LibraryTake,
  onAsset: AddAsset | undefined,
  addTake: AddTake,
): Promise<SentTake> {
  if (!onAsset) throw new Error("Open the studio to send takes.");
  // Refuse an oversized take before the frame lands, so a send is never half done.
  if (take.video.size > DIRECTOR_MEDIA_BYTES) throw new Error(TOO_LARGE);
  const frame = await onAsset({
    blob: take.first,
    filename: `${take.name}.png`,
    use: "reference",
  });
  const media = await addTake(asTake(take), take);
  if (!media) throw new Error("Open the studio to send takes.");
  return {
    take: { id: take.id, name: take.name },
    frame: sent(frame),
    video: sent(media.video),
    audio: media.audio ? sent(media.audio) : null,
  };
}
