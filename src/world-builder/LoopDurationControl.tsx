import { useEffect, useState } from "react";
import {
  framesForTypedSeconds,
  TAKE_FPS,
  TAKE_FRAMES,
  takeSeconds,
} from "./take-duration";

/** Local loop draft only: no scene geometry is rebuilt while dragging. */
export function LoopDurationControl({
  frames,
  disabled,
  onChange,
}: {
  frames: number;
  disabled: boolean;
  onChange: (frames: number) => void;
}) {
  const span = (frames - 1) / TAKE_FPS,
    [draft, setDraft] = useState(span.toFixed(2));
  useEffect(() => setDraft(span.toFixed(2)), [span]);
  const commit = () => {
    const next = framesForTypedSeconds(draft);
    if (next instanceof Error) setDraft(span.toFixed(2));
    else {
      onChange(next);
      setDraft(((next - 1) / TAKE_FPS).toFixed(2));
    }
  };
  return (
    <div className="wb-loop-duration" role="group" aria-label="Loop duration">
      <label>
        <span>Total time</span>
        <span className="wb-loop-seconds">
          <input
            type="text"
            inputMode="decimal"
            aria-label="Loop duration in seconds"
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              } else if (event.key === "Escape") setDraft(span.toFixed(2));
            }}
          />
          <span>s</span>
        </span>
      </label>
      <input
        type="range"
        aria-label="Loop duration slider"
        aria-valuetext={`${span.toFixed(2)} second motion, ${frames} frames at ${TAKE_FPS} fps`}
        min={TAKE_FRAMES.min}
        max={TAKE_FRAMES.max}
        step={TAKE_FRAMES.step}
        value={frames}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>
        {frames} frames · 24 fps · {takeSeconds(frames).toFixed(2)} s video
      </output>
    </div>
  );
}
