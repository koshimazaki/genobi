import type { RefObject } from "react";
import type { WorldRuntime } from "./runtime";

export interface SoundPreview {
  element: HTMLAudioElement;
  duration: number;
}

/** Keep the final picture up until the rendered decay has finished. */
export function soundPreviewFrames(pictureFrames: number, duration: number) {
  return Math.max(pictureFrames, Math.ceil(duration * 24));
}

export function soundPreviewControls(
  preview: RefObject<SoundPreview | null>,
  runtime: RefObject<WorldRuntime | null>,
  setPlaying: (playing: boolean) => void,
  available: () => boolean = () => true,
) {
  return {
    playSoundPreview(element: HTMLAudioElement, duration: number) {
      if (!runtime.current) throw new Error("The scene is still starting.");
      if (!available())
        throw new Error("Wait for the current scene operation.");
      if (!Number.isFinite(duration) || duration <= 0)
        throw new Error("Rendered sound has no playable duration.");
      if (!element.getAttribute("src"))
        throw new Error("Rendered sound is still loading.");
      setPlaying(false);
      // Preview changes camera mode without committing a walked pose into the
      // frozen recipe whose acoustics were just rendered.
      runtime.current.editor?.setMode("shot", false);
      preview.current = { element, duration };
      setPlaying(true);
    },
    stopSoundPreview() {
      if (preview.current) setPlaying(false);
    },
  };
}
