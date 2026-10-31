import type { BuilderSession } from "./useBuilderSession";

/** One capture recipe for the existing combined layout/video/reverb graph. */
export default function CaptureLayout({
  s,
  send,
}: {
  s: BuilderSession;
  send?: () => Promise<void>;
}) {
  return (
    <div className="wb-panel-actions">
      <button
        disabled={!s.ready || s.busy}
        onClick={() =>
          s.change({ width: 1024, height: 576, frames: 193, seconds: 8 })
        }
      >
        Layout-to-video capture preset
      </button>
      {send && (
        <button disabled={!s.take || s.busy} onClick={() => s.run(send)}>
          Use take in Layout-to-video
        </button>
      )}
      <p className="wb-hint">
        Capture at 1024 × 576, 193 frames, 24 fps. The Camera workflow combines
        layout-guided LTX video and scene-derived CPU reverb in one job. No
        generation starts here.
      </p>
    </div>
  );
}
