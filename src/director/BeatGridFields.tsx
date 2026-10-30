import type { Project } from "../../shared/director/types";
import Icon from "../components/Icon";
import { BEAT_GRID_LIMITS as LIMITS } from "../../shared/director/beat-grid-command";
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_BPM,
  downbeatAt,
} from "../../shared/director/beat-grid";

type Composition = Project["composition"];

/**
 * The song's grid: tempo, where a downbeat falls and the beats in a bar.
 * Fields apply on leaving them, as the other transport fields do.
 */
export default function BeatGridFields({
  composition,
  frame,
  busy,
  update,
}: {
  composition: Composition;
  frame: number;
  busy: boolean;
  update: (patch: Partial<Composition>) => void;
}) {
  const offset = composition.beatOffsetSeconds ?? 0;
  return (
    <>
      <label>
        BPM
        <input
          type="number"
          min={LIMITS.bpm.min}
          max={LIMITS.bpm.max}
          key={composition.bpm}
          defaultValue={composition.bpm ?? DEFAULT_BPM}
          disabled={busy}
          onBlur={(e) => {
            if (e.target.validity.valid && e.target.value)
              update({ bpm: Number(e.target.value) });
          }}
        />
      </label>
      <label title="Where a downbeat falls on the composition, in seconds">
        DOWNBEAT
        <input
          aria-label="Beat offset seconds"
          type="number"
          min={LIMITS.beatOffsetSeconds.min}
          max={LIMITS.beatOffsetSeconds.max}
          step={0.001}
          key={offset}
          defaultValue={offset}
          disabled={busy}
          onBlur={(e) => {
            if (e.target.validity.valid && e.target.value)
              update({ beatOffsetSeconds: Number(e.target.value) });
          }}
        />
      </label>
      <label>
        BAR
        <input
          aria-label="Beats per bar"
          type="number"
          min={LIMITS.beatsPerBar.min}
          max={LIMITS.beatsPerBar.max}
          step={1}
          key={composition.beatsPerBar}
          defaultValue={composition.beatsPerBar ?? DEFAULT_BEATS_PER_BAR}
          disabled={busy}
          onBlur={(e) => {
            if (e.target.validity.valid && e.target.value)
              update({ beatsPerBar: Number(e.target.value) });
          }}
        />
      </label>
      <button
        disabled={busy}
        onClick={() =>
          update({ beatOffsetSeconds: downbeatAt(frame, composition.fps) })
        }
        title="Put a downbeat on the playhead frame: scrub to the song's first downbeat, then press"
        aria-label="Set downbeat at playhead"
      >
        <Icon name="grid" size={15} />
      </button>
    </>
  );
}
