import type { BuilderSession } from "./useBuilderSession";
import { Fold } from "./FloatingPanel";

/** One capture recipe for the existing combined layout/video/reverb graph. */
export default function CaptureLayout({
  s,
  send,
}: {
  s: BuilderSession;
  send?: () => Promise<void>;
}) {
  const { width, height, frames } = s.recipe;
  const formatMatches = width === 1024 && height === 576 && frames === 193;
  return (
    <div className="wb-layout-handoff">
      <div className="wb-capture-row">
        <span>Layout-to-video</span>
        <output className="wb-readout-chip" aria-label="Layout-to-video format">
          {formatMatches ? "Scene format set" : "Preset needed"}
        </output>
      </div>
      <p className="wb-hint">
        {formatMatches
          ? send
            ? "Capture a take, then send it to Camera to review the generation inputs."
            : "Capture a take for the Layout-to-video workflow."
          : send
            ? "Use the format preset, capture a take, then send it to Camera."
            : "Use the format preset, then capture a take."}
      </p>
      <div className="wb-panel-actions">
        <button
          disabled={!s.ready || s.busy}
          aria-pressed={formatMatches}
          onClick={() =>
            s.change({ width: 1024, height: 576, frames: 193, seconds: 8 })
          }
        >
          Use Layout-to-video format
        </button>
        {send && (
          <button disabled={!s.take || s.busy} onClick={() => s.run(send)}>
            Use take in Layout-to-video
          </button>
        )}
      </div>
      <Fold title="Workflow details">
        <p className="wb-hint">
          The format is 1024 × 576, 193 frames at 24 fps. Layout-to-video
          combines layout-guided LTX video and scene-derived CPU reverb in one
          job.{" "}
          {send
            ? "Sending to Camera uses the take's saved format and recipe. It does not upload files or start generation."
            : "This preset only sets the capture format; it does not start generation."}
        </p>
      </Fold>
    </div>
  );
}
