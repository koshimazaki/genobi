import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { Layer, Project } from "../../shared/director/types";
import { timelinePatch, type EditEdge } from "../../shared/director/timeline";
import type { SnapGrid } from "../../shared/director/beat-grid";
import { laneId, lanes, trackFamily } from "../../shared/director/tracks";
import type { TrimRequest } from "./useTrimPreview";

/** Not a valid layer or track id, so it never names a real lane. */
export const NEW_LANE = "+new";
export interface Ghost {
  id: string;
  edge: EditEdge;
  patch: Partial<Layer>;
  lane: string;
  fits: boolean;
  /** Unsnapped start, shown when the clip does not fit the target lane. */
  raw: number;
}
interface Drag {
  x: number;
  layer: Layer;
  edge: EditEdge;
}

export function useClipDrag({
  project,
  pixels,
  snap,
  magnet = true,
  disabled,
  select,
  aligned,
  edit,
  retrack,
  preview,
}: {
  project: Project;
  pixels: number;
  snap: SnapGrid;
  /** Pull to nearby clip edges; Snap: Free turns it off, as Shift does. */
  magnet?: boolean;
  disabled: boolean;
  select: (id: string) => void;
  aligned: () => void;
  edit: (id: string, patch: Partial<Layer>) => void;
  retrack: (id: string, startFrame: number, lane: string) => void;
  preview: (r: TrimRequest | null) => void;
}) {
  const drag = useRef<Drag | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const families = useMemo(
    () => new Map(lanes(project.layers).map((l) => [l.id, l.family])),
    [project.layers],
  );
  // Moves may cross to a lane of the same family or the new-track target.
  function laneUnder(e: PointerEvent<HTMLElement>, d: Drag) {
    const own = laneId(d.layer);
    if (d.edge !== "move") return own;
    const lane = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-lane]")?.dataset.lane;
    if (!lane || lane === own) return own;
    if (lane === NEW_LANE) return lane;
    return families.get(lane) === trackFamily(d.layer.kind) ? lane : own;
  }
  function ghostAt(e: PointerEvent<HTMLElement>): Ghost | null {
    const d = drag.current;
    if (!d) return null;
    const lane = laneUnder(e, d),
      delta = (e.clientX - d.x) / pixels;
    if (Math.abs(e.clientX - d.x) < 2 && lane === laneId(d.layer)) return null;
    const patch = timelinePatch(
      project,
      d.layer,
      d.edge,
      delta,
      snap,
      e.shiftKey || !magnet ? 0 : 7 / pixels,
      lane,
    );
    return {
      id: d.layer.id,
      edge: d.edge,
      patch,
      lane,
      fits: Object.keys(patch).length > 0,
      raw: Math.round(d.layer.startFrame + delta),
    };
  }
  function trimRequest(d: Drag, g: Ghost | null): TrimRequest | null {
    if (d.edge === "move" || !g?.fits) return null;
    return { edge: d.edge, layer: { ...d.layer, ...g.patch } as Layer };
  }
  function cancel() {
    if (drag.current && drag.current.edge !== "move") preview(null);
    drag.current = null;
    setGhost(null);
  }
  return {
    ghost,
    dragging: ghost?.edge === "move",
    begin(e: PointerEvent<HTMLElement>, layer: Layer, edge: EditEdge) {
      e.stopPropagation();
      select(layer.id);
      aligned();
      if (layer.locked || disabled) return;
      drag.current = { x: e.clientX, layer, edge };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    move(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d) return;
      const g = ghostAt(e);
      setGhost(g);
      const r = trimRequest(d, g);
      if (r) preview(r);
    },
    end(e: PointerEvent<HTMLElement>) {
      const d = drag.current,
        g = ghostAt(e);
      cancel();
      if (!d || !g?.fits) return;
      if (g.lane !== laneId(d.layer))
        retrack(
          d.layer.id,
          g.patch.startFrame ?? d.layer.startFrame,
          g.lane === NEW_LANE ? "new" : g.lane,
        );
      else edit(d.layer.id, g.patch);
    },
    cancel,
  };
}
