import { useCallback, useRef, useState, type RefObject } from "react";
import type { WorldRuntime } from "./runtime";
import { stopPreviewThen } from "./scene-playback";
import { soundPreviewControls, type SoundPreview } from "./sound-preview";

/** Update imperative guards before a mode change can commit a walked pose. */
export function usePlaybackState(
  runtime: RefObject<WorldRuntime | null>,
  audio: RefObject<HTMLAudioElement | null>,
  /** The preview frame being drawn, which an action must let land. */
  inFlight: RefObject<Promise<unknown>>,
  available?: () => boolean,
) {
  const [playing, updatePlaying] = useState(false);
  const [revision, updateRevision] = useState(0);
  const playingRef = useRef(false);
  const soundPreview = useRef<SoundPreview | null>(null);
  const setPlaying = useCallback(
    (value: boolean) => {
      // React effects run later; Stop followed by leaving Walk must be idle now.
      playingRef.current = value;
      runtime.current?.editor?.lockEdits(value);
      if (!value) {
        audio.current?.pause();
        soundPreview.current?.element.pause();
        soundPreview.current = null;
      } else updateRevision((n) => n + 1);
      updatePlaying(value);
    },
    [runtime, audio],
  );
  /** Wrap an action so pressing it during Play stops the preview first. */
  const stopping = useCallback(
    <T>(work: () => Promise<T>) =>
      () =>
        stopPreviewThen(
          {
            playing: () => playingRef.current,
            stop: () => setPlaying(false),
            settle: () => inFlight.current,
          },
          work,
        ),
    [setPlaying, inFlight],
  );
  /** Resolves once the preview frame being drawn has landed. */
  const settled = useCallback(
    () => inFlight.current.catch(() => {}),
    [inFlight],
  );
  return {
    playing,
    playingRef,
    setPlaying,
    stopping,
    settled,
    revision,
    soundPreview,
    sound: soundPreviewControls(soundPreview, runtime, setPlaying, available),
  };
}
