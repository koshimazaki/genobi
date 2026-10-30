import { useRef, useState } from "react";
import type { Project } from "../../shared/director/types";

const MAX_SECONDS = 120;

/**
 * The composition's END edge: drag it, or focus it and use the arrow keys
 * (Shift for a second), to change the playback range. The new length applies
 * on release, so one drag is one Undo step. It cannot pass the last clip's
 * end; the readout says where that limit is.
 */
export default function CompositionEnd({
  project,
  pixels,
  disabled,
  setDuration,
}: {
  project: Project;
  pixels: number;
  disabled: boolean;
  setDuration: (frames: number) => void;
}) {
  const { fps, durationFrames } = project.composition;
  const floor = Math.max(
    fps,
    ...project.layers.map((l) => l.startFrame + l.durationFrames),
  );
  const max = MAX_SECONDS * fps;
  const [draft, setDraft] = useState<number | null>(null);
  const start = useRef<{ x: number; frames: number; id: number } | null>(null);
  const clamp = (f: number) => Math.max(floor, Math.min(max, Math.round(f)));
  const frames = draft ?? durationFrames;
  return (
    <button
      type="button"
      className={`dir-composition-end ${draft !== null ? "is-dragging" : ""}`}
      aria-label="Composition end"
      aria-valuetext={`${(frames / fps).toFixed(2)} seconds`}
      title={`Drag to change the composition's length · clips end at ${(floor / fps).toFixed(2)}s`}
      disabled={disabled}
      style={{ left: `calc(var(--dir-gutter) + ${frames * pixels}px)` }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        start.current = {
          x: e.clientX,
          frames: durationFrames,
          id: e.pointerId,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        setDraft(durationFrames);
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s?.id === e.pointerId)
          setDraft(clamp(s.frames + (e.clientX - s.x) / pixels));
      }}
      onPointerUp={() => {
        const next = draft;
        start.current = null;
        setDraft(null);
        if (next !== null && next !== durationFrames) setDuration(next);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const step = (e.shiftKey ? fps : 1) * (e.key === "ArrowLeft" ? -1 : 1);
        const next = clamp(durationFrames + step);
        if (next !== durationFrames) setDuration(next);
      }}
    >
      <span>END</span>
      {draft !== null && (
        <output className="dir-composition-end-readout">
          {(draft / fps).toFixed(2)}s
        </output>
      )}
    </button>
  );
}
