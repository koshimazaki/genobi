import { useRef, type PointerEvent } from "react";
import type { Project } from "../../shared/director/types";
import FrameRuler from "./FrameRuler";
import NoteMarkers from "./NoteMarkers";
import { NEW_LANE } from "./useClipDrag";
import type { TimeUnits } from "./timecode";

/**
 * The playhead row and the frame ruler, sharing the lanes' gutter and origin.
 * Both scrub continuously: a drag seeks as it moves, with renders coalesced so
 * a fast drag never queues a frame per pixel.
 */
export default function TimelineRuler({
  project,
  frame,
  pixels,
  units,
  dots,
  disabled,
  seek,
  select,
  dragging,
  newTrackTarget,
}: {
  project: Project;
  frame: number;
  pixels: number;
  units: TimeUnits;
  /** The channel column is at dot density: no gutter text. */
  dots: boolean;
  disabled: boolean;
  seek: (frame: number) => Promise<void> | void;
  select: (id: string) => void;
  dragging: boolean;
  newTrackTarget: boolean;
}) {
  const { fps, durationFrames } = project.composition;
  const width = durationFrames * pixels;
  const pending = useRef<number | null>(null),
    running = useRef(false);
  function scrub(f: number) {
    pending.current = Math.min(durationFrames - 1, Math.max(0, Math.round(f)));
    if (running.current) return;
    running.current = true;
    void (async () => {
      try {
        while (pending.current !== null) {
          const next = pending.current;
          pending.current = null;
          await seek(next);
        }
      } finally {
        running.current = false;
      }
    })();
  }
  const at = (e: PointerEvent<HTMLElement>) =>
    (e.clientX - e.currentTarget.getBoundingClientRect().left) / pixels;
  return (
    <>
      <div className="dir-seek-row">
        <span className="dir-gutter dir-seek-head">
          <label htmlFor="director-playhead">Playhead</label>
          <output htmlFor="director-playhead">
            {frame} / {durationFrames - 1} f
          </output>
        </span>
        <div className="dir-seek-track" style={{ width }}>
          <input
            id="director-playhead"
            aria-label="Playhead"
            aria-valuetext={`${frame} / ${durationFrames - 1} frames`}
            type="range"
            min={0}
            max={durationFrames - 1}
            step={1}
            value={frame}
            disabled={disabled}
            onChange={(e) => scrub(e.target.valueAsNumber)}
            style={{ width: Math.max(0, (durationFrames - 1) * pixels) + 14 }}
          />
        </div>
      </div>
      <div className="dir-ruler-row">
        <span className="dir-gutter">
          {dots
            ? fps
            : units === "time"
              ? "CHANNELS / SECONDS"
              : `CHANNELS / ${fps} FPS`}
        </span>
        <div
          className="dir-ruler"
          style={{ width }}
          onPointerDown={(e) => {
            if (disabled || e.button !== 0) return;
            if ((e.target as HTMLElement).closest(".dir-note-marker")) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            scrub(at(e));
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(at(e));
          }}
        >
          <FrameRuler
            fps={fps}
            durationFrames={durationFrames}
            zoom={pixels * fps}
            units={units}
          />
          <NoteMarkers
            project={project}
            pixels={pixels}
            units={units}
            disabled={disabled}
            seek={(f) => void seek(f)}
            select={select}
          />
        </div>
        {dragging && (
          <div
            className={`dir-new-track ${newTrackTarget ? "is-target" : ""}`}
            data-lane={NEW_LANE}
          >
            + New track · drop here
          </div>
        )}
      </div>
    </>
  );
}
