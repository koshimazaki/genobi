import { useState, type DragEvent } from "react";
import { studioDropFile, acceptsStudioMedia } from "../studio/media-drop";
import { useShell } from "../studio/ShellContext";
import { studioStore } from "../studio/store";
import { PROJECT_ASSET_DRAG, readAssetDrag } from "./asset-drag";
import { addAssetTrack } from "./add-asset-track";

/**
 * Media dropped on the timeline: a project asset dragged from the drawer, a
 * studio video, or files. Every path keeps its ownership and reference checks;
 * a refusal is shown on the timeline, never swallowed.
 */
export function useTimelineDrop({
  disabled,
  frame,
  drop,
}: {
  disabled: boolean;
  frame: number;
  drop: (files: File[]) => void;
}) {
  const shell = useShell();
  const [error, setError] = useState("");
  function onDragOver(e: DragEvent<HTMLElement>) {
    if (!disabled && acceptsStudioMedia(e.dataTransfer.types)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }
  function onDrop(e: DragEvent<HTMLElement>) {
    if (disabled) return;
    if (e.dataTransfer.types.includes(PROJECT_ASSET_DRAG)) {
      e.preventDefault();
      e.stopPropagation();
      try {
        const state = studioStore.getState();
        const bundle = state.director.bundle;
        if (!bundle || Object.values(state.operations).some(Boolean)) return;
        const { assetId } = readAssetDrag(e.dataTransfer, bundle);
        state.actions.commit(
          addAssetTrack(bundle, assetId, frame, state.settings.imageFrames),
          bundle,
        );
        setError("");
      } catch (error) {
        setError(String(error));
      }
      return;
    }
    if (e.dataTransfer.getData("application/x-director-video")) {
      e.preventDefault();
      e.stopPropagation();
      void studioDropFile(
        e.dataTransfer,
        studioStore.getState().director.bundle,
        shell?.library,
      )
        .then((file) => {
          if (file) drop([file]);
        })
        .catch((error) => setError(String(error)));
      return;
    }
    if (e.dataTransfer.files.length) {
      e.preventDefault();
      e.stopPropagation();
      drop(Array.from(e.dataTransfer.files));
    }
  }
  return { error, onDragOver, onDrop };
}
