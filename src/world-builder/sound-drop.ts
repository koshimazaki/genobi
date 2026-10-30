import type { DragEvent } from "react";
import {
  RECENT_AUDIO_DRAG,
  audioChoices,
  droppedAudio,
  type RecentAudio,
} from "./audio-history";
import { loadAndPlay, type AutoplaySession } from "./sound-autoplay";
import type { AudioHistory } from "./useAudioHistory";

/**
 * The scene's drop target: an audio file from the desktop, or a recent-track
 * row dragged from the Sound panel. Either loads and plays, like a pick.
 */
export function dropOnScene(
  s: AutoplaySession & { history: Pick<AudioHistory, "recent"> },
  projectAudio: RecentAudio[] = [],
  reveal: () => void = () => {},
) {
  const accepts = (ev: DragEvent) =>
    ev.dataTransfer.types.includes("Files") ||
    ev.dataTransfer.types.includes(RECENT_AUDIO_DRAG);
  return {
    onDragOver(ev: DragEvent) {
      if (!accepts(ev)) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
    },
    onDrop(ev: DragEvent) {
      const id = ev.dataTransfer.getData(RECENT_AUDIO_DRAG);
      if (!id && !ev.dataTransfer.files.length) return;
      ev.preventDefault();
      ev.stopPropagation();
      reveal();
      if (id) {
        const item = audioChoices(s.history.recent, projectAudio).find(
          (t) => t.id === id,
        );
        if (item) loadAndPlay(s, item.open(), item.source, item.label);
        else
          s.run(() =>
            Promise.reject(new Error("That track is no longer in the list.")),
          );
        return;
      }
      const file = droppedAudio(ev.dataTransfer.files);
      if (file) loadAndPlay(s, file, "drop");
      else
        s.run(() =>
          Promise.reject(
            new Error("Drop an audio file (WAV, MP3, FLAC, OGG or M4A)."),
          ),
        );
    },
  };
}
