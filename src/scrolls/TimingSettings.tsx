import type { useScrolls } from "./useScrolls";
import { fitToBeats, timedCells } from "../../shared/scrolls/commands";
import { retimeCell } from "../../shared/scrolls/timing";
export function TimingSettings({
  s,
  disabled,
}: {
  s: ReturnType<typeof useScrolls>;
  disabled: boolean;
}) {
  const d = s.bundle.document,
    selected = timedCells(d).find((c) => c.id === s.selectedCell);
  return (
    <details className="scroll-timing-settings">
      <summary>Timing & sound settings</summary>
      <p>
        Drag any image, camera or action block to move its linked group. Trim an
        edge to change its hold. Overlapping groups are pushed right. Alt-drag
        uses frames.
      </p>
      <div className="scroll-toolbar">
        <label>
          BPM
          <input
            type="number"
            min={20}
            max={300}
            step="any"
            defaultValue={d.timing.bpm}
            key={`bpm-${d.timing.bpm}`}
            disabled={disabled}
            onBlur={(e) =>
              s.edit({ op: "timing", timing: { bpm: Number(e.target.value) } })
            }
          />
        </label>
        <label>
          Beat origin (s)
          <input
            type="number"
            min={0}
            max={120}
            step="any"
            defaultValue={d.timing.beatOffsetSeconds ?? 0}
            key={`offset-${d.timing.beatOffsetSeconds}`}
            disabled={disabled}
            onBlur={(e) =>
              s.edit({
                op: "timing",
                timing: { beatOffsetSeconds: Number(e.target.value) },
              })
            }
          />
        </label>
        <button
          disabled={disabled}
          onClick={() => {
            try {
              s.commit({ ...s.bundle, document: fitToBeats(d, 4) });
            } catch (e) {
              s.setMessage((e as Error).message);
            }
          }}
        >
          Fit cells to 4 beats
        </button>
        <button
          disabled={disabled || !d.timing.audioId}
          onClick={() => void s.analyze()}
        >
          Analyze audio
        </button>
      </div>
      {s.analysis?.grid && (
        <p>
          Suggested {s.analysis.grid.bpm.toFixed(2)} BPM ·{" "}
          {Math.round(s.analysis.grid.confidence * 100)}% confidence.{" "}
          <button
            disabled={disabled}
            onClick={() => {
              const grid = s.analysis!.grid!;
              const bar = 240 / grid.bpm;
              const origin =
                (d.timing.audioStartFrame ?? 0) / d.timing.fps -
                (d.timing.sourceStartFrame ?? 0) / d.timing.fps +
                grid.firstBeatSeconds;
              s.edit({
                op: "timing",
                timing: {
                  bpm: grid.bpm,
                  beatOffsetSeconds: ((origin % bar) + bar) % bar,
                },
              });
            }}
          >
            Use tempo & beat phase
          </button>{" "}
          Your cuts stay unchanged until retimed.
        </p>
      )}
      {d.timing.audioId && (
        <div className="scroll-toolbar">
          <label>
            Audio starts (frame)
            <input
              type="number"
              min={0}
              max={7199}
              defaultValue={d.timing.audioStartFrame ?? 0}
              key={`audio-${d.timing.audioStartFrame}`}
              disabled={disabled}
              onBlur={(e) =>
                s.edit({
                  op: "timing",
                  timing: { audioStartFrame: Number(e.target.value) },
                })
              }
            />
          </label>
          <label>
            Audio in-point (frame)
            <input
              type="number"
              min={0}
              max={72000}
              defaultValue={d.timing.sourceStartFrame ?? 0}
              key={`source-${d.timing.sourceStartFrame}`}
              disabled={disabled}
              onBlur={(e) =>
                s.edit({
                  op: "timing",
                  timing: { sourceStartFrame: Number(e.target.value) },
                })
              }
            />
          </label>
        </div>
      )}
      {selected && (
        <div className="scroll-toolbar">
          <label>
            Cell starts (frame)
            <input
              type="number"
              min={0}
              defaultValue={selected.startFrame}
              key={`${selected.id}-${selected.startFrame}`}
              disabled={disabled}
              onBlur={(e) => {
                try {
                  s.commit({
                    ...s.bundle,
                    document: retimeCell(
                      d,
                      selected.id,
                      "move",
                      Number(e.target.value),
                      "frame",
                    ),
                  });
                } catch (error) {
                  s.setMessage((error as Error).message);
                }
              }}
            />
          </label>
          <label>
            Hold (frames)
            <input
              type="number"
              min={1}
              defaultValue={selected.durationFrames}
              key={`${selected.id}-${selected.durationFrames}-hold`}
              disabled={disabled}
              onBlur={(e) => {
                try {
                  s.commit({
                    ...s.bundle,
                    document: retimeCell(
                      d,
                      selected.id,
                      "right",
                      selected.startFrame + Number(e.target.value),
                      "frame",
                    ),
                  });
                } catch (error) {
                  s.setMessage((error as Error).message);
                }
              }}
            />
          </label>
        </div>
      )}
    </details>
  );
}
