/**
 * The Capture panel's Passes & sync readouts and its Output section: every
 * hand-off and download the panel had, with their enable rules unchanged.
 * Holodeck's "Overlays & sync" (MIT, see Holodeck-LICENSE.txt) becomes what
 * the World Builder records: a colour pass, a linear depth pass, the
 * matching WAV and the move.
 */
import type { BuilderSession } from "./useBuilderSession";
import { download } from "./useBuilderSession";
import type { BuilderAssets } from "./useBuilderAssets";
import { Fold } from "./FloatingPanel";
import { Parameters } from "./Controls";
import { StatusDot } from "./CapturePrimitives";
import { takeSeconds } from "./take-duration";

/** What a take will carry. Depth is always rendered; its range is editable in Shot. */
export function CapturePasses({
  s,
  setEditable,
}: {
  s: BuilderSession;
  setEditable: boolean;
}) {
  const r = s.recipe;
  const seconds = r.seconds ?? takeSeconds(r.frames);
  return (
    <section className="wb-capture-section" aria-label="Passes and sync">
      <span className="wb-capture-label">Passes &amp; sync</span>
      <ul className="wb-status-dots">
        <StatusDot on>Colour · WebM, first frame PNG</StatusDot>
        <StatusDot on>
          Depth · linear, {r.depthNear} m white to {r.depthFar} m black
        </StatusDot>
        <StatusDot on={!!s.audioName}>
          {s.audioName
            ? `Matching audio · WAV · ${s.audioName}`
            : "No audio loaded · the take is silent"}
        </StatusDot>
        <StatusDot on={!!r.loop}>
          Move {seconds.toFixed(2)} s{r.loop ? " · seamless loop" : ""}
        </StatusDot>
      </ul>
      <fieldset disabled={!setEditable}>
        <Parameters
          recipe={r}
          change={s.change}
          names={["depthNear", "depthFar"]}
        />
      </fieldset>
    </section>
  );
}

/** Hand-offs and the Export take fold. */
export function CaptureOutput({
  s,
  a,
  shot,
}: {
  s: BuilderSession;
  a: BuilderAssets;
  shot: boolean;
}) {
  const take = s.take;
  return (
    <section className="wb-capture-section" aria-label="Output">
      <span className="wb-capture-label">Output</span>
      <div className="wb-panel-actions">
        {a.canSend && (
          <button
            disabled={!shot || s.busy || !!a.saving}
            onClick={() => s.run(s.stopping(a.sendFirstFrame))}
          >
            Send first frame to Director
          </button>
        )}
        {window.parent !== window && (
          <button
            disabled={!shot || s.busy}
            onClick={() => s.run(s.stopping(s.toComfy))}
          >
            Send take to Comfy
          </button>
        )}
        {a.room && (
          <button
            disabled={!!a.saving || s.busy}
            title="Local ffmpeg room on the take's WAV (Space); never paid"
            onClick={() => s.run(a.applyRoom)}
          >
            Apply room · {a.room.label}
          </button>
        )}
      </div>
      {take && (
        <Fold title="Export take">
          <div className="wb-panel-actions">
            {a.toAssets && (
              <button
                disabled={!!a.saving || s.busy}
                onClick={() => s.run(a.addCurrentTake)}
              >
                Add take to project assets
              </button>
            )}
            <button onClick={() => download(take.video, `${take.name}.webm`)}>
              Video · WebM
            </button>
            <button onClick={() => download(take.first, `${take.name}.png`)}>
              First frame
            </button>
            {take.depth && (
              <button
                onClick={() => download(take.depth!, `${take.name}-depth.webm`)}
              >
                Depth · WebM
              </button>
            )}
            <button
              onClick={() => download(take.manifest, `${take.name}.json`)}
            >
              Capture receipt
            </button>
            {take.audio && (
              <button onClick={() => download(take.audio!, `${take.name}.wav`)}>
                Matching audio · WAV
              </button>
            )}
          </div>
        </Fold>
      )}
      <p className="wb-hint">
        WebM carries the visual guidance; the matching WAV carries the
        soundtrack.
      </p>
    </section>
  );
}
