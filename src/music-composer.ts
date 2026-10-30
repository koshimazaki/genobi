import { MUSIC_CAPTION_LIMIT, MUSIC_LYRICS_LIMIT } from "../shared/music";
import type { Job } from "../shared/types";
import type { ComposerState } from "./useComposer";

/**
 * The music composer's part of `composerReducer`: a song restores as its
 * caption, lyrics and length, the way a still restores its own fields. A full
 * Recreate takes the length too; a title click keeps the composer's own.
 */
export function restoreMusic(
  state: ComposerState,
  job: Job,
  full: boolean,
): ComposerState {
  return {
    ...state,
    generator: "audio",
    model: "minimax-music-3",
    description: job.description,
    lyrics: job.lyrics ?? "",
    acoustic: null,
    imageRegions: [],
    imageReferences: [],
    ...(full ? { duration: job.duration } : {}),
  };
}

/** Generate stays off without a caption, or with text the server would refuse. */
export const musicBlocked = (state: ComposerState) =>
  !state.description.trim() ||
  state.description.length > MUSIC_CAPTION_LIMIT ||
  (state.lyrics?.length ?? 0) > MUSIC_LYRICS_LIMIT;
