import {
  INSTALL_STEP_LABELS,
  INSTALL_STEPS,
  type InstallStep,
  type RuntimeProgress,
  type StepOutcome,
} from "../../shared/voice-install";
import Spinner from "../components/Spinner";
import type { VoiceInstallState } from "./setup-api";
import "./voice-setup.css";

export const gigabytes = (bytes: number) => `${(bytes / 1e9).toFixed(2)} GB`;

/** The pinned runtime (torch, transformers and their wheels): not measured. */
export const RUNTIME_SIZE = "several hundred megabytes";

/**
 * One step's outcome. The server reports each step; a state without them
 * (an older server) is read from the current phase as before.
 */
export function stepOutcome(
  state: VoiceInstallState | undefined,
  step: InstallStep,
): StepOutcome {
  const reported = state?.steps?.[step];
  if (reported) return reported;
  if (state?.phase === "ready") return "done";
  const current = INSTALL_STEPS.findIndex((id) => id === state?.phase);
  const index = INSTALL_STEPS.indexOf(step);
  return current < 0 || index > current
    ? "pending"
    : index < current
      ? "done"
      : "running";
}

/** "Collecting torch · 12 packages so far", from pip's own lines. */
export function runtimeText(runtime?: RuntimeProgress) {
  if (!runtime) return `Downloads about ${RUNTIME_SIZE}; this takes a while.`;
  const count = `${runtime.packages} package${runtime.packages === 1 ? "" : "s"}`;
  if (runtime.action === "installed") return `Installed ${count}`;
  if (runtime.action === "installing") return `Installing ${count}`;
  const verb = runtime.action === "downloading" ? "Downloading" : "Collecting";
  return `${verb}${runtime.package ? ` ${runtime.package}` : ""} · ${count} so far`;
}

const MARK: Record<StepOutcome, string> = {
  done: "✓",
  skipped: "✓",
  failed: "!",
  running: "",
  pending: "",
};

/** The small line under a step, when it has one. */
function detail(
  step: InstallStep,
  outcome: StepOutcome,
  state: VoiceInstallState,
  total: number,
) {
  if (step === "check" && outcome === "done")
    return state.found
      ? `Model found locally · ${state.found}`
      : "Not found on this machine";
  if (step === "download") {
    if (outcome === "skipped") return undefined;
    if (state.reused && outcome === "done")
      return "Already on disk; checked, not downloaded";
    if (state.bytes && outcome !== "pending")
      return `${gigabytes(state.bytes)} / ${gigabytes(total)}`;
  }
  if (step === "runtime" && (outcome === "running" || outcome === "pending"))
    return runtimeText(state.runtime);
  return undefined;
}

/**
 * The installer's own progress, as the server reports it: the voice panel
 * and setup's summary step both render this, so the two cannot drift. Each
 * step shows its outcome: done, skipped (the model was found, so nothing
 * was downloaded), running, pending or failed.
 */
export function VoiceInstallProgress({
  state,
  total,
  pending,
  onCancel,
}: {
  state?: VoiceInstallState;
  /** The model's size, from the setup grant. */
  total: number;
  pending: boolean;
  onCancel: () => void;
}) {
  const ready = state?.phase === "ready";
  // A failed install keeps its list, so the failed step shows where it stopped.
  const shown = !!state && (state.busy || ready || state.phase === "error");
  const current = INSTALL_STEPS.find(
    (step) => stepOutcome(state, step) === "running",
  );
  return (
    <div className="voice-install-progress">
      {shown && (
        <ol
          className="voice-install-steps"
          aria-label="Voice installation progress"
        >
          {INSTALL_STEPS.map((step, index) => {
            const outcome = stepOutcome(state, step);
            const text = detail(step, outcome, state, total);
            return (
              <li key={step} data-state={outcome}>
                <span aria-hidden="true">
                  {outcome === "running" ? (
                    <Spinner name="dots" />
                  ) : (
                    MARK[outcome] || index + 1
                  )}
                </span>
                {INSTALL_STEP_LABELS[step]}
                {step === "download" && outcome === "skipped" && (
                  <> · skipped, model found locally</>
                )}
                {text && <small>{text}</small>}
              </li>
            );
          })}
        </ol>
      )}
      {current === "download" && (
        <progress
          aria-label="Model download"
          value={state?.bytes ?? 0}
          max={total}
        />
      )}
      <div aria-live="polite" className="sr-only">
        {ready
          ? "Voice Mode installed."
          : current && INSTALL_STEP_LABELS[current]}
      </div>
      {state?.phase === "cancelled" && (
        <p role="status">
          Installation cancelled. Temporary files were removed.
        </p>
      )}
      {state?.busy && (
        <div className="voice-setup-actions">
          <span>You can close this and keep working.</span>
          <button onClick={onCancel} disabled={pending}>
            Cancel installation
          </button>
        </div>
      )}
    </div>
  );
}
