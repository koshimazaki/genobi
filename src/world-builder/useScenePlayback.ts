import { useEffect, useRef, type RefObject } from "react";
import { runPreview } from "./scene-playback";
import type { Recipe } from "./recipe";
import type { SceneAdapter } from "./useBuilderSession";
import { soundPreviewFrames, type SoundPreview } from "./sound-preview";

export function useScenePlayback({
  playing,
  revision,
  soundPreview,
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
  revision: number;
  soundPreview: RefObject<SoundPreview | null>;
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
    const rendered = soundPreview.current;
    const audio = rendered?.element ?? audioElement.current;
    const frames = () =>
      rendered
        ? soundPreviewFrames(current.current.frames, rendered.duration)
        : current.current.frames;
    let live = true;
    const stop = runPreview({
      frames,
      loop: () => !rendered && looping.current,
      elapsed: rendered
        ? () =>
            rendered.element.ended
              ? frames() / 24
              : rendered.element.currentTime
        : undefined,
      active: () => guards.current.active(),
      held: () => guards.current.held(),
      async draw(frame) {
        frame = Math.min(frame, current.current.frames - 1);
        if (rendering.current()) await api.current?.render(frame);
        else setFrame(frame);
      },
      restartAudio() {
        if (!audio?.getAttribute("src")) return;
        audio.currentTime = 0;
        void audio.play().catch((e: unknown) => {
          if (!live || !guards.current.active()) return;
          if (rendered && (e as Error | null)?.name !== "AbortError") {
            setPlaying(false);
            setStatus("Room sound could not start; press Preview again.");
            return;
          }
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
      live = false;
      stop();
      audio?.pause();
    };
  }, [
    playing,
    revision,
    soundPreview,
    current,
    api,
    audioElement,
    setPlaying,
    setFrame,
    setError,
    setStatus,
  ]);
}
