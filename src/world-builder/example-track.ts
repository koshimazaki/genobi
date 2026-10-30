import { useEffect, useRef, useState } from "react";
import type { AudioSource } from "./audio-history";
import { loadAndPlay } from "./sound-autoplay";

/**
 * The example track: the first 60 seconds of the owner's "Dimensions" (Koshi
 * Mosaic), a 128 kbps MP3 with a 1.5-second fade-out; licence in LICENCES.md. It is fetched when the
 * World Builder opens and shown as the current track, but it is decoded and
 * played only on the first Play press, in any mode: browsers refuse sound
 * before a gesture, and decoding on open would hold the scene busy while a
 * Comfy graph sends its recipe or audio. Once any track has loaded, or the
 * example has played once, it is no longer offered; it stays in Recent.
 * The studio serves it from `public/`, the Comfy node bundle copies it to the
 * same relative path (`scripts/build-scene-adapter.mjs`).
 */
export const EXAMPLE_TRACK = {
  path: "./media/director-templates/dimensions-mix/mix-track.mp3",
  label: "Dimensions",
  credit: "Koshi Mosaic · Dimensions",
};

export interface ExampleTrack {
  /** The example's bytes while it is still on offer; null otherwise. */
  blob: Blob | null;
  label: string;
  /** Who made it, shown as the track name's tooltip. */
  credit: string;
}

/** Offers the example until `audioName` says a track has loaded. */
export function useExampleTrack(audioName: string): ExampleTrack {
  const [blob, setBlob] = useState<Blob | null>(null);
  const done = useRef(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const response = await fetch(
        new URL(EXAMPLE_TRACK.path, document.baseURI),
      );
      if (!response.ok) return;
      const bytes = await response.blob();
      if (alive && !done.current && bytes.size)
        setBlob(new Blob([bytes], { type: "audio/mpeg" }));
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (audioName) {
      done.current = true;
      setBlob(null);
    }
  }, [audioName]);
  return { blob, label: EXAMPLE_TRACK.label, credit: EXAMPLE_TRACK.credit };
}

/** The part of the session the Play buttons need. */
export interface PlaySession {
  playing: boolean;
  audioURL: string;
  example: ExampleTrack;
  setPlaying(value: boolean): void;
  run(work: () => Promise<unknown>): void;
  loadAudio(blob: Blob, source: AudioSource, label?: string): Promise<unknown>;
}

/** Play or Stop; the first Play with no track loads the example and plays it. */
export function togglePlay(s: PlaySession) {
  if (!s.playing && !s.audioURL && s.example.blob)
    loadAndPlay(s, s.example.blob, "example", s.example.label);
  else s.setPlaying(!s.playing);
}
