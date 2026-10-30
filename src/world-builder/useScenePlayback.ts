import { useEffect, useRef, type RefObject } from "react";
import { runPreview } from "./scene-playback";
import type { Recipe } from "./recipe";
import type { SceneAdapter } from "./useBuilderSession";

export function useScenePlayback({
  playing,
  loop,
  current,
  api,
  audioElement,
  setPlaying,
  setFrame,
  setError,
  setStatus,
  renders,
  active,
  held,
}: {
  playing: boolean;
  loop: boolean;
  current: RefObject<Recipe>;
  api: RefObject<SceneAdapter | null>;
  audioElement: RefObject<HTMLAudioElement | null>;
  setPlaying: (playing: boolean) => void;
  setFrame: (frame: number) => void;
  setError: (message: string) => void;
  setStatus: (message: string) => void;
  /**
   * False in Walk and Build: their own loop draws the scene, so playback only
   * plays the track and moves the frame the signal scopes read.
   */
  renders: () => boolean;
  /** Read synchronously, so Stop ends drawing before React's cleanup runs. */
  active: () => boolean;
  /** The set is reloading under a live edit; the preview skips that frame. */
  held: () => boolean;
}) {
  const looping = useRef(loop),
    rendering = useRef(renders),
    guards = useRef({ active, held });
  looping.current = loop;
  rendering.current = renders;
  guards.current = { active, held };
  useEffect(() => {
    if (!playing) return;
    const audio = audioElement.current;
    const stop = runPreview({
      frames: () => current.current.frames,
      loop: () => looping.current,
      active: () => guards.current.active(),
      held: () => guards.current.held(),
      async draw(frame) {
        if (rendering.current()) await api.current?.render(frame);
        else setFrame(frame);
      },
      restartAudio() {
        if (!audio?.getAttribute("src")) return;
        audio.currentTime = 0;
        void audio.play().catch((e: unknown) => {
          // A refused autoplay stops the preview so Play is there to press.
          if ((e as Error | null)?.name === "NotAllowedError") {
            setPlaying(false);
            setStatus(
              "The browser held the track back; press Play to hear it.",
            );
          } else if ((e as Error | null)?.name !== "AbortError")
            setStatus(
              "Audio playback was blocked; the visual envelope still previews.",
            );
        });
      },
      finish: () => setPlaying(false),
      fail(e) {
        setError(e instanceof Error ? e.message : String(e));
        setPlaying(false);
      },
    });
    return () => {
      stop();
      audio?.pause();
    };
  }, [
    playing,
    current,
    api,
    audioElement,
    setPlaying,
    setFrame,
    setError,
    setStatus,
  ]);
}
