import { useState } from "react";
import type { Project } from "../../shared/director/types";

const MAX_SECONDS = 120;

/**
 * Composition length in seconds: a range for quick changes and a field for
 * exact ones, committed when released so a drag is one Undo step. Length may
 * run past the last clip (that time is shown as uncovered); it cannot end
 * before a clip does, and the limit is stated rather than applied silently.
 */
export default function LengthControl({
  composition: c,
  clipsEnd,
  busy,
  update,
}: {
  composition: Project["composition"];
  clipsEnd: number;
  busy: boolean;
  update: (patch: Partial<Project["composition"]>) => void;
}) {
  const seconds = c.durationFrames / c.fps;
  const [draft, setDraft] = useState<number | null>(null);
  const floor = Math.max(1, Math.ceil((clipsEnd / c.fps) * 10) / 10);
  const value = draft ?? seconds;
  const commit = (n: number | null) => {
    setDraft(null);
    if (n === null || !Number.isFinite(n)) return;
    const frames = Math.round(
      Math.min(MAX_SECONDS, Math.max(floor, n)) * c.fps,
    );
    if (frames !== c.durationFrames) update({ durationFrames: frames });
  };
  return (
    <div className="dir-length">
      <label htmlFor="director-length">
        Length <small>seconds</small>
      </label>
      <input
        id="director-length"
        aria-label="Composition length"
        type="range"
        min={1}
        max={MAX_SECONDS}
        step={0.1}
        value={value}
        disabled={busy}
        onChange={(e) => setDraft(Math.max(floor, e.target.valueAsNumber))}
        onPointerUp={() => commit(draft)}
        onKeyUp={() => commit(draft)}
        onBlur={() => commit(draft)}
      />
      <input
        aria-label="Composition seconds"
        type="number"
        min={floor}
        max={MAX_SECONDS}
        step={0.1}
        key={`${c.durationFrames}/${c.fps}`}
        defaultValue={Math.round(seconds * 100) / 100}
        disabled={busy}
        onBlur={(e) => {
          if (e.target.value) commit(Number(e.target.value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <small className="dir-length-note" aria-live="polite">
        {clipsEnd < c.durationFrames
          ? `Clips end at ${(clipsEnd / c.fps).toFixed(2)}s · ${((c.durationFrames - clipsEnd) / c.fps).toFixed(2)}s uncovered`
          : `Clips fill the composition · at least ${floor}s`}
      </small>
    </div>
  );
}
