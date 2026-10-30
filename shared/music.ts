import { CLOUD_CREDITS_PER_GPU_SECOND } from "./h3";
import type { Generator, VideoModel } from "./types";

/**
 * Music: MiniMax Music 3 on the workflow route, from Comfy's official
 * `audio_minimax_music_3` template (`workflows/minimax-music-3.README.md`).
 * A caption (the request's `description`), optional lyrics and a duration go
 * in; one MP3 comes out. Both adapters read these bounds, and the composer
 * draws its controls from the registry entry that carries them.
 */
export const MUSIC_MODEL = "minimax-music-3" satisfies VideoModel;

export const isMusic = (generator: Generator | undefined) =>
  generator === "audio";

/**
 * The studio's own caps, not the model's: the template's example caption and
 * lyrics are each about 1,200 characters, and the encoder states no limit.
 */
export const MUSIC_CAPTION_LIMIT = 2000;
export const MUSIC_LYRICS_LIMIT = 3000;

/**
 * The most seconds a song may run (`max_duration`), not its length: the
 * encoder samples until it emits its end token, often well before this, and
 * the latent takes the length it measured. Forcing the latent longer only adds
 * a tail the DiT renders without conditioning (ComfyUI's
 * `comfy/ldm/minimax_music`), so the composer shows this as a ceiling. The
 * encoder takes up to 360 s and the template's note says about
 * five minutes is supported; the studio keeps to two minutes, the encoder's
 * default, until a run has measured what a long song costs.
 */
export const MUSIC_DURATION = { min: 5, max: 120 } as const;

/**
 * Budget estimate, not a cap or a measurement. Comfy Cloud publishes no
 * per-run rate for this graph and reports no credits per run, so a candidate
 * is estimated the way the H3 workflow is (`shared/h3.ts`): an allowance of
 * active GPU seconds at the Cloud rate. No Music 3 run has been timed; the
 * 240-second allowance is H3's, kept until the first approved run's Cloud
 * usage replaces it. One candidate is one run and one quote.
 */
export const MUSIC_ESTIMATE_GPU_SECONDS = 240;
export const MUSIC_ESTIMATE_CREDITS =
  MUSIC_ESTIMATE_GPU_SECONDS * CLOUD_CREDITS_PER_GPU_SECOND;

/** The file a saved music take is stored and offered as. */
export const AUDIO_EXTENSION: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/flac": "flac",
};
