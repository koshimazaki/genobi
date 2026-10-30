import {
  PROFILE_SETUP_LABELS,
  PROFILE_SETUP_STEPS,
  type HermesProfileSetupState,
} from "../../shared/agent-runner-setting";
import Spinner from "../components/Spinner";

const MARK = { done: "✓", failed: "!", running: "", pending: "" } as const;

/**
 * Hermes' `genobi` profile being set up by the studio: each step's outcome
 * as the server reports it, then done or the reason it stopped. No command
 * to run and no restart: the runner reads the profile on its next start.
 */
export function HermesProfileProgress({
  state,
}: {
  state?: HermesProfileSetupState;
}) {
  if (!state || state.phase === "idle") return null;
  return (
    <div className="setup-hermes-profile">
      <ol className="voice-install-steps" aria-label="Hermes setup progress">
        {PROFILE_SETUP_STEPS.map((step, index) => {
          const outcome = state.steps[step] ?? "pending";
          return (
            <li key={step} data-state={outcome}>
              <span aria-hidden="true">
                {outcome === "running" ? (
                  <Spinner name="dots" />
                ) : (
                  MARK[outcome] || index + 1
                )}
              </span>
              {PROFILE_SETUP_LABELS[step]}
            </li>
          );
        })}
      </ol>
      {state.phase === "done" && (
        <p role="status">
          Hermes is set up{state.created ? " with a new genobi profile" : ""}.
        </p>
      )}
      {state.phase === "failed" && state.error && (
        <p role="alert">{state.error}</p>
      )}
    </div>
  );
}
