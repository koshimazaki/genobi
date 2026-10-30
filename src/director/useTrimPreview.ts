import { useMemo, useRef, useState, type RefObject } from "react";
import { LatestFrame } from "../dual-editor/latest-frame";
import type { Layer } from "../../shared/director/types";
import type { DirectorRenderer } from "./renderer";
import { timecode, type TimeUnits } from "./timecode";

export interface TrimRequest {
  edge: "left" | "right";
  layer: Layer;
}

/** Show the first kept frame for an in-point, the last kept frame for an out-point. */
export function trimFrame({ edge, layer }: TrimRequest) {
  return edge === "left"
    ? layer.startFrame
    : layer.startFrame + layer.durationFrames - 1;
}

export function trimLabel(r: TrimRequest, fps: number, units: TimeUnits) {
  const frame = trimFrame(r),
    l = r.layer;
  const source =
    "sourceStartFrame" in l
      ? ` · source ${timecode(l.sourceStartFrame + frame - l.startFrame, fps, units)}`
      : "";
  return `${r.edge === "left" ? "In" : "Out"} ${timecode(frame, fps, units)}${source}`;
}

/**
 * Like Dual Swords' boundary preview: while an edge is dragged the viewer
 * renders that edge's frame, latest request only; release returns to the playhead.
 */
export function useTrimPreview(
  runtime: RefObject<DirectorRenderer | null>,
  playhead: number,
  fps: number,
  units: TimeUnits,
  report: (e: unknown) => void,
) {
  const [label, setLabel] = useState("");
  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;
  const reportRef = useRef(report);
  reportRef.current = report;
  const queue = useMemo(
    () =>
      new LatestFrame<TrimRequest | null, void>(
        async (r) => {
          await runtime.current?.render(
            r ? trimFrame(r) : playheadRef.current,
            r?.layer,
          );
        },
        () => {},
        (_r, e) => reportRef.current(e),
      ),
    [runtime],
  );
  return {
    label,
    preview(r: TrimRequest | null) {
      setLabel(r ? trimLabel(r, fps, units) : "");
      void queue.request(r);
    },
  };
}
