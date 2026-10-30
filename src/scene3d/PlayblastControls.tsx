import ThemedSelect from "../components/ThemedSelect";
import {
  PLAYBLAST_SECONDS,
  PLAYBLAST_SIZES,
  playblastFrames,
} from "../../shared/camera-path-playblast";
import type { PlayblastState } from "./usePlayblast";

export function PlayblastControls({
  ready = true,
  seconds,
  size,
  state,
  fileBase,
  onSeconds,
  onSize,
  onRender,
  onCancel,
}: {
  ready?: boolean;
  seconds: number;
  size: string;
  state: PlayblastState;
  fileBase: string;
  onSeconds: (seconds: number) => void;
  onSize: (size: string) => void;
  onRender: () => void;
  onCancel: () => void;
}) {
  const rendering = state.phase === "rendering";
  const progress = rendering
    ? state.done / state.total
    : state.phase === "saved"
      ? 1
      : 0;
  return (
    <section className="s3d-playblast" aria-label="Playblast">
      <details className="s3d-fold">
        <summary>Settings · length & size</summary>
        <div className="s3d-playblast-row">
          <label>
            <span>Length</span>
            <ThemedSelect
              aria-label="Length"
              value={seconds}
              disabled={rendering}
              onChange={(e) => onSeconds(Number(e.target.value))}
            >
              {PLAYBLAST_SECONDS.map((s) => (
                <option key={s} value={s}>
                  {s} s · {playblastFrames(s)} frames
                </option>
              ))}
            </ThemedSelect>
          </label>
          <label>
            <span>Size</span>
            <ThemedSelect
              aria-label="Size"
              value={size}
              disabled={rendering}
              onChange={(e) => onSize(e.target.value)}
            >
              {PLAYBLAST_SIZES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </ThemedSelect>
          </label>
        </div>
      </details>
      <div className="s3d-playblast-row">
        {rendering ? (
          <button type="button" className="s3d-secondary" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="s3d-primary"
            disabled={!ready}
            onClick={onRender}
          >
            Render playblast
          </button>
        )}
      </div>
      <progress max={1} value={progress} aria-label="Playblast progress" />
      <p className="s3d-status" role="status">
        {state.phase === "idle" &&
          "Renders the plate on this scene to MP4 and puts it on its own Director track."}
        {state.phase === "rendering" &&
          `Rendering frame ${state.done} of ${state.total}…`}
        {state.phase === "saved" && (
          <>
            Saved “{state.name}” to the Director.{" "}
            <a href={state.video} download={`${fileBase}.mp4`}>
              Download MP4
            </a>{" "}
            ·{" "}
            <a href={state.path} download={`${fileBase}.camera-path.json`}>
              Camera path JSON
            </a>
          </>
        )}
        {state.phase === "error" && state.message}
      </p>
    </section>
  );
}
