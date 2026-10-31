import { inputAudioUnavailable } from "./input-audio";
import type { BuilderSession } from "./useBuilderSession";
import "./scene-live-input.css";

export function SceneLiveInputControls({
  s,
  openSound,
}: {
  s: BuilderSession;
  openSound(): void;
}) {
  const unavailable = inputAudioUnavailable();
  const { phase, frame, signals } = s.inputState;
  const active = phase !== "idle";
  return (
    <div className="wb-input-take" role="group" aria-label="Live synth input">
      <div className="wb-input-take-actions">
        <button
          type="button"
          disabled={!!unavailable || !s.ready || s.busy || active}
          onClick={() => {
            openSound();
            void s.run(async () => {
              if (!s.inputTake.current)
                throw new Error("The scene is still starting.");
              return s.inputTake.current.start();
            });
          }}
        >
          {phase === "requesting"
            ? "Allow audio input…"
            : phase === "recording"
              ? "Recording synth input…"
              : phase === "preparing"
                ? "Preparing recording…"
                : "Record synth input"}
        </button>
        {phase === "recording" && (
          <button type="button" onClick={() => s.inputTake.current?.stop()}>
            Stop and use recording
          </button>
        )}
        {(phase === "requesting" || phase === "recording") && (
          <button type="button" onClick={() => s.inputTake.current?.cancel()}>
            Cancel input
          </button>
        )}
      </div>
      <p className="wb-hint">
        {unavailable ??
          "Uses your system’s default microphone or line input. Choose the synth input in system audio settings. Recording ends with this take; its audio is then prepared for repeatable playback and export."}
      </p>
      {active && (
        <p className="wb-hint" role="status">
          {phase === "recording"
            ? "Recording input. Stop to use this recording, or cancel to discard it."
            : phase === "requesting"
              ? "Waiting for browser permission. Nothing is sent to a server."
              : "Analyzing the recorded input…"}
        </p>
      )}
      {phase === "recording" && (
        <output aria-label="Input recording meter" aria-live="off">
          {(frame / s.recipe.fps).toFixed(1)} /{" "}
          {(s.recipe.frames / s.recipe.fps).toFixed(1)} s · input{" "}
          {Math.round((signals?.level ?? 0) * 100)}%
        </output>
      )}
    </div>
  );
}
