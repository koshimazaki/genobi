import type { Project } from "../../shared/director/types";
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_BPM,
} from "../../shared/director/beat-grid";
import BeatGridFields from "./BeatGridFields";

/**
 * The less frequent timing fields behind one disclosure: the song's grid
 * (BPM, downbeat, bar, downbeat at playhead) and a new still's duration,
 * which is frames per image, not the composition's rate.
 */
export default function TimingDisclosure({
  composition,
  frame,
  busy,
  update,
  imageFrames,
  setImageFrames,
}: {
  composition: Project["composition"];
  frame: number;
  busy: boolean;
  update: (patch: Partial<Project["composition"]>) => void;
  imageFrames: number;
  setImageFrames: (frames: number) => void;
}) {
  return (
    <details className="dir-timing">
      <summary>
        Timing
        <span>
          {composition.bpm ?? DEFAULT_BPM} BPM ·{" "}
          {composition.beatsPerBar ?? DEFAULT_BEATS_PER_BAR}/bar · still{" "}
          {imageFrames}f
        </span>
      </summary>
      <div className="dir-timing-fields">
        <BeatGridFields
          composition={composition}
          frame={frame}
          busy={busy}
          update={update}
        />
        <label>
          IMAGE STEP
          <input
            aria-label="Image duration frames"
            title="How long a new still lasts, in frames"
            type="number"
            min={1}
            max={3600}
            value={imageFrames}
            disabled={busy}
            onChange={(e) => {
              if (e.target.validity.valid && e.target.value)
                setImageFrames(Number(e.target.value));
            }}
          />
        </label>
      </div>
    </details>
  );
}
