import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand/vanilla";
import type { StudioState } from "../studio/store";
import { ZOOM_PIXELS } from "./snap";

/**
 * Media dropped on the timeline lands at the playhead, and could land there
 * unseen: a short clip at a wide zoom is a sliver. So a drop says so plainly.
 * The new clip is selected, the timeline zooms in to twice its current
 * pixels per frame (within the manual range), the clip scrolls into view and
 * carries a brief accent. The zoom stays where the drop put it; the Zoom
 * control and Fit all shrink it back. Nothing here is project data or Undo.
 */
export const REVEAL_MS = 1600;

const listeners = new Set<(layerId: string) => void>();

/** Called by every drop path once its clip is committed. */
export function announceDrop(layerId: string | undefined) {
  if (layerId) for (const listener of listeners) listener(layerId);
}

export function onDrop(listener: (layerId: string) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Twice the pixels per frame shown now, in whole pixels within the manual range. */
export function revealPixels(pixels: number) {
  return Math.max(
    ZOOM_PIXELS.min,
    Math.min(ZOOM_PIXELS.max, Math.round(pixels * 2)),
  );
}

/** Selects the dropped clip and doubles the zoom, leaving Fit all. */
export function revealDroppedClip(
  store: StoreApi<StudioState>,
  layerId: string,
  pixels: number,
) {
  const state = store.getState();
  const fps = state.director.bundle?.project.composition.fps;
  if (!fps) return;
  state.actions.workspace({ selected: layerId });
  state.actions.settings({ zoom: revealPixels(pixels) * fps, fit: false });
}

/** The ids of layers `after` has that `before` did not, in stack order. */
export function addedLayers(
  before: { layers: { id: string }[] },
  after: { layers: { id: string }[] },
) {
  const old = new Set(before.layers.map((l) => l.id));
  return after.layers.filter((l) => !old.has(l.id)).map((l) => l.id);
}

/**
 * The timeline's side: on each announced drop, reveal the clip at the current
 * zoom, then scroll it into view and mark it for REVEAL_MS once it has
 * rendered at the new width.
 */
export function useDropReveal(store: StoreApi<StudioState>, pixels: number) {
  const latest = useRef(pixels);
  latest.current = pixels;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let marked: HTMLElement | null = null;
    let firstFrame = 0;
    let secondFrame = 0;
    let active = true;
    const unmark = () => {
      if (marked) delete marked.dataset.revealed;
      marked = null;
    };
    const stop = onDrop((layerId) => {
      revealDroppedClip(store, layerId, latest.current);
      // Two frames: one for the store update to render, one for layout.
      // Cancel both on a second drop or unmount, so an abandoned Editor
      // cannot highlight a clip in a different workspace.
      if (firstFrame) cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => {
        if (!active) return;
        secondFrame = requestAnimationFrame(() => {
          if (!active) return;
          const clip = [
            ...document.querySelectorAll<HTMLElement>(
              ".dir-timeline [data-layer-id]",
            ),
          ].find((el) => el.dataset.layerId === layerId);
          if (!clip) return;
          clearTimeout(timer);
          unmark();
          marked = clip;
          clip.dataset.revealed = "true";
          const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
          clip.scrollIntoView({
            block: "nearest",
            inline: "center",
            behavior: still ? "auto" : "smooth",
          });
          timer = setTimeout(unmark, REVEAL_MS);
        });
      });
    });
    return () => {
      active = false;
      stop();
      if (firstFrame) cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
      clearTimeout(timer);
      unmark();
    };
  }, [store]);
}
