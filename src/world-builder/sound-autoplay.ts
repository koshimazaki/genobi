import type { AudioSource } from "./audio-history";

/** The part of the session a person's load needs. */
export interface AutoplaySession {
  run(work: () => Promise<unknown>): void;
  loadAudio(blob: Blob, source: AudioSource, label?: string): Promise<unknown>;
  setPlaying(value: boolean): void;
}

/**
 * A track a person chose (a picked file, a drop, a recent or project track)
 * plays as soon as it has loaded. The pick or drop is the user gesture; the
 * decode in between is async, so a browser may still refuse `play()`, which
 * the playback loop reports while Play stays available. A failed load does
 * not play. An agent's `setAudio` and audio a Comfy editor sends call the
 * session's loader directly and never come through here: they do not play.
 */
export function loadAndPlay(
  s: AutoplaySession,
  blob: Blob,
  source: AudioSource,
  label?: string,
) {
  s.run(async () => {
    await s.loadAudio(blob, source, label);
    s.setPlaying(true);
  });
}
