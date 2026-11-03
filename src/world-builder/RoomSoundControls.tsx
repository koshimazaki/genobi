import { Fold } from "./FloatingPanel";
import { NumberControl } from "./Controls";
import ThemedSelect from "../components/ThemedSelect";
import type { BuilderSession } from "./useBuilderSession";
import { useRoomSound } from "./useRoomSound";
import { RoomAcousticControls } from "./RoomAcousticControls";
import { RoomAcousticReadout } from "./RoomAcousticReadout";
import { ROOM_AUDIO_LABEL } from "./scene-room-ir";
import { download } from "./session-io";
import "./room-sound.css";

export function RoomSoundControls({
  s,
  folded = false,
}: {
  s: BuilderSession;
  folded?: boolean;
}) {
  const sound = useRoomSound(s);
  const available = !!(
    s.recipe.motion?.room || s.recipe.motion?.acousticZones?.length
  );
  const disabled = !s.ready || s.busy || s.capturing;
  return (
    <div className="wb-room-sound" hidden={folded}>
      <Fold title="Room sound · CPU" open={available}>
        <p className="wb-hint">
          {ROOM_AUDIO_LABEL}. Free browser rendering; no model or key needed.
        </p>
        {!available ? (
          <p className="wb-hint">
            Load Endless descent from the gallery to hear outdoor space become a
            cathedral, club and small studio.
          </p>
        ) : (
          <>
            <RoomAcousticReadout s={s} />
            <p className="wb-hint">
              Control music moves the scene. Choose the dry sound emitted inside
              the room separately. An independent soundtrack can be added in
              Editor.
            </p>
            <label
              className="wb-room-source-drop"
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const file = event.dataTransfer.files[0];
                if (file && !disabled) void sound.loadFile(file);
              }}
            >
              <strong>{sound.source?.label ?? "Choose dry room sound"}</strong>
              <span>Drop or choose an audio file · up to 32 MB</span>
              <input
                type="file"
                accept="audio/*"
                aria-label="Dry room source file"
                disabled={disabled}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void sound.loadFile(file);
                  event.target.value = "";
                }}
              />
            </label>
            <div className="wb-room-sound-actions">
              <button
                type="button"
                disabled={disabled || sound.loading}
                onClick={() => void sound.testImpulses()}
              >
                Use test impulses
              </button>
              <button
                type="button"
                disabled={disabled || sound.loading || !s.track.current}
                onClick={() => void sound.useControl()}
              >
                Use control track as dry source
              </button>
            </div>
            {sound.source?.origin === "control-copy" && (
              <p className="wb-hint">
                Independent copy of the control track; the wet result never
                drives motion.
              </p>
            )}
            <div className="wb-room-sound-grid">
              <label>
                Room treatment
                <ThemedSelect
                  aria-label="Room sound treatment"
                  value={sound.settings.treatment}
                  onChange={(event) =>
                    sound.changeSettings({
                      treatment: event.target.value as "static" | "dynamic",
                    })
                  }
                >
                  <option value="dynamic">Follow scene timeline</option>
                  <option value="static">Hold first-frame room</option>
                </ThemedSelect>
              </label>
              <label>
                Decay tail
                <ThemedSelect
                  aria-label="Room sound tail"
                  value={sound.settings.tail}
                  onChange={(event) =>
                    sound.changeSettings({
                      tail: event.target.value as "extend" | "trim-fade",
                    })
                  }
                >
                  <option value="extend">Extend and hold picture</option>
                  <option value="trim-fade">Trim with 50 ms fade</option>
                </ThemedSelect>
              </label>
              <NumberControl
                label="Room wet gain"
                value={sound.settings.wet}
                min={0}
                max={2}
                step={0.05}
                change={(wet) => sound.changeSettings({ wet })}
              />
              <NumberControl
                label="Room dry gain"
                value={sound.settings.dry}
                min={0}
                max={2}
                step={0.05}
                change={(dry) => sound.changeSettings({ dry })}
              />
            </div>
            <div className="wb-room-sound-actions">
              <button
                type="button"
                className="wb-primary"
                disabled={
                  disabled || sound.loading || sound.rendering || !sound.source
                }
                onClick={() => void sound.render()}
              >
                Prepare room sound
              </button>
              {sound.rendering && (
                <button type="button" onClick={sound.cancel}>
                  Cancel room render
                </button>
              )}
            </div>
            {sound.rendering && (
              <progress
                aria-label="Room sound render progress"
                value={sound.progress.completed}
                max={Math.max(1, sound.progress.total)}
              />
            )}
            {sound.status && (
              <p className="wb-hint" role="status">
                {sound.status}
              </p>
            )}
            {sound.error && (
              <p className="wb-room-sound-error" role="alert">
                {sound.error}
              </p>
            )}
            {sound.output && (
              <>
                {sound.output.receipt.schedule.approximation?.budgetLimited && (
                  <p className="wb-hint">
                    Fast room movement exceeds this render’s{" "}
                    {sound.output.receipt.schedule.snapshots.length} snapshot
                    budget. The largest room or position approximation is{" "}
                    {sound.output.receipt.schedule.approximation.maxErrorMeters?.toFixed(
                      2,
                    )}{" "}
                    m. Slower changes allow closer acoustic tracking.
                  </p>
                )}
                <div className="wb-room-sound-actions">
                  <button
                    type="button"
                    disabled={disabled || !sound.url}
                    onClick={() => void sound.preview()}
                  >
                    Preview room sound with scene
                  </button>
                  {s.playing && (
                    <button type="button" onClick={() => s.setPlaying(false)}>
                      Stop preview
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      download(sound.output!.wav, "room-sound.wav")
                    }
                  >
                    Download room WAV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      download(
                        new Blob(
                          [JSON.stringify(sound.output!.receipt, null, 2)],
                          { type: "application/json" },
                        ),
                        "room-sound-receipt.json",
                      )
                    }
                  >
                    Download sound receipt
                  </button>
                </div>
                <p className="wb-hint">
                  {sound.output.receipt.mix.tailPolicy === "extend"
                    ? `The scene holds its last frame for ${sound.output.receipt.mix.tailSeconds.toFixed(2)} s of decay.`
                    : "Audio ends with the picture, with a deliberate 50 ms fade."}{" "}
                  The receipt saves the frozen scene and sound settings. Add the
                  WAV in Editor to export a final video.
                </p>
                {sound.output.receipt.impulseResponses.some(
                  (ir) => ir.truncated,
                ) && (
                  <p className="wb-hint">
                    Some room decay reaches the{" "}
                    {sound.output.receipt.schedule.maxIRSeconds} s response
                    limit and fades there.
                  </p>
                )}
              </>
            )}
            <RoomAcousticControls s={s} />
          </>
        )}
        <audio ref={sound.audio} src={sound.url || undefined} hidden />
      </Fold>
    </div>
  );
}
