/**
 * The Capture panel, laid out after Holodeck's World Capture panel (MIT, see
 * Holodeck-LICENSE.txt): a status strip, a transport with the record button,
 * then Output and optional settings. Format and Rate & time sit side by side
 * when there is room. It renders inside the dock or the pop-out window alike.
 */
import { useEffect, useState } from "react";
import type { BuilderSession } from "./useBuilderSession";
import { download } from "./useBuilderSession";
import type { BuilderAssets } from "./useBuilderAssets";
import { Badge } from "./CapturePrimitives";
import { Fold } from "./FloatingPanel";
import { CaptureFormat, CaptureTiming } from "./CaptureFormat";
import { CaptureOutput, CapturePasses } from "./CaptureOutput";
import { captureBadge, lengthLabel } from "./capture-panel";
import { TAKE_FPS } from "./take-duration";
import "./capture-panel.css";

/** Whether Record live (under the scene) is recording, polled as LiveControls does. */
function useLiveRecording(s: BuilderSession) {
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    const timer = setInterval(
      () => setRecording(!!s.api.current?.live?.status().recording),
      250,
    );
    return () => clearInterval(timer);
  }, [s.api]);
  return recording;
}

export function CaptureControls({
  s,
  a,
  shot,
}: {
  s: BuilderSession;
  a: BuilderAssets;
  shot: boolean;
}) {
  // Capture works from every mode and during Play, which it stops and then
  // captures from frame zero; framing and stills stay in Shot.
  const idle = s.ready && !s.busy;
  const setEditable = shot && s.ready && !s.busy;
  const liveRecording = useLiveRecording(s);
  const { width, height, frames } = s.recipe;
  const badge = captureBadge({
    capturing: s.capturing,
    progress: s.progress,
    frames,
    take: s.take,
    liveRecording,
  });
  const live = s.take?.mode === "live";
  return (
    <div className="wb-capture">
      <div className="wb-capture-status" aria-live="polite">
        <Badge tone={badge.tone} dot pulse={badge.pulse}>
          {badge.label}
        </Badge>
        <Badge>
          {width}×{height}
        </Badge>
        <Badge>{live ? "30 FPS requested" : `${TAKE_FPS} FPS`}</Badge>
        <Badge>{lengthLabel(frames)}</Badge>
        <Badge>{a.toAssets ? "MP4 → assets" : "WEBM"}</Badge>
      </div>
      <div className="wb-capture-transport">
        <button
          className="wb-record"
          data-recording={s.capturing || undefined}
          // An add still running keeps a second take from colliding. From
          // Walk or Build the viewport becomes the shot camera first.
          disabled={
            s.previewOnly || !s.ready || (!s.capturing && (!idle || !!a.saving))
          }
          onClick={() =>
            s.capturing
              ? s.api.current?.cancel()
              : s.run(s.stopping(a.captureTake))
          }
        >
          {s.capturing ? "Cancel capture" : "Capture take"}
        </button>
        <button
          disabled={s.previewOnly || !idle || !shot}
          onClick={() =>
            s.run(
              s.stopping(async () =>
                download(await s.firstFrame(), "world-first-frame.png"),
              ),
            )
          }
        >
          Save PNG
        </button>
        <div className="wb-capture-meter">
          <div>
            <progress
              value={s.capturing ? s.progress : 0}
              max={frames}
              aria-label="Capture progress"
            />
            <output>
              {s.capturing ? s.progress : 0}/{frames} f
            </output>
          </div>
          <small>
            {s.take
              ? `${s.take.name}${live ? " · live clip" : ""}`
              : "no take yet"}
          </small>
        </div>
      </div>
      {s.previewOnly && (
        <p className="wb-hint">
          Capture and PNG export need WebGL. The geometry preview supports scene
          configuration, camera travel and audio playback.
        </p>
      )}
      {(a.saving || a.result || s.error) && (
        <p className="wb-capture-result" data-error={s.error ? "" : undefined}>
          {a.saving === "take"
            ? "Adding the take to project assets…"
            : a.saving === "frame"
              ? "Adding the first frame to Inspirations…"
              : a.saving === "room"
                ? `Putting the take's sound in the ${a.room?.label ?? "room"}…`
                : s.error || a.result}
        </p>
      )}
      {a.saving === "take" && (
        <button onClick={a.cancelAdd}>Cancel adding the take</button>
      )}
      {!shot && (
        <p className="wb-hint">
          Capture take freezes this view as the shot camera, returns to Shot and
          replays it with the recipe&rsquo;s move. Record live below the scene
          records walking as it happens. Format, move and depth range change in
          Shot camera.
        </p>
      )}
      <CaptureOutput s={s} a={a} shot={shot} />
      <Fold title="Capture settings">
        <div className="wb-capture-columns">
          <CaptureFormat s={s} disabled={!setEditable} />
          <CaptureTiming s={s} idle={idle} setEditable={setEditable} />
        </div>
        <CapturePasses s={s} setEditable={setEditable} />
      </Fold>
    </div>
  );
}
