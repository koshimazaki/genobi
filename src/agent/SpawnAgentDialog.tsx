import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_HERMES_CHOICE,
  SETUP_RUNNER_NAMES,
  SETUP_RUNNERS,
  type SetupRunner,
} from "../../shared/agent-runner-setting";
import type { AgentSessionMode } from "../../shared/agent-session";
import { HermesProfileProgress } from "../setup/HermesProfileProgress";
import { HermesModel, SetupHarnesses } from "../setup/SetupHarnesses";
import { openSignIn } from "../setup/connect-api";
import type { RunnerOffer, RunnerPick } from "./spawn";
import {
  cancelSpawn,
  checkedSignIn,
  choose,
  chooseMode,
  useSpawnStep,
  type SpawnStep,
} from "./spawn-store";
import "./spawn.css";

/** The one spawn dialog, mounted once beside the Genobi bubble. */
export default function SpawnAgentDialog() {
  const step = useSpawnStep();
  const dialog = useRef<HTMLDialogElement>(null);
  const open = step.kind !== "closed";
  useEffect(() => {
    const node = dialog.current;
    if (open && node && !node.open) node.showModal?.();
    if (!open) node?.close?.();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="spawn-agent"
      aria-labelledby="spawn-agent-title"
      onCancel={(event) => {
        event.preventDefault();
        cancelSpawn();
      }}
    >
      {open && (
        <SpawnAgentView
          step={step}
          onChoose={choose}
          onSignIn={(runner) => void openSignIn(runner).catch(() => {})}
          onCheck={checkedSignIn}
          onMode={chooseMode}
          onCancel={cancelSpawn}
        />
      )}
    </dialog>
  );
}

/** What the dialog shows for a step; rendered in tests. */
export function SpawnAgentView({
  step,
  onChoose,
  onSignIn,
  onCheck,
  onMode,
  onCancel,
}: {
  step: SpawnStep;
  onChoose: (pick: RunnerPick) => void;
  onSignIn: (runner: SetupRunner) => void;
  onCheck: () => void;
  onMode: (mode: AgentSessionMode) => void;
  onCancel: () => void;
}) {
  return (
    <div className="spawn-agent__body">
      <header>
        <h2 id="spawn-agent-title">Start Genobi</h2>
        <button type="button" aria-label="Close" onClick={onCancel}>
          ×
        </button>
      </header>
      {step.kind === "working" && <p role="status">{step.text}</p>}
      {step.kind === "choose" && (
        <RunnerChooser offer={step.offer} onChoose={onChoose} />
      )}
      {step.kind === "profile" && (
        <>
          <p role="status">Setting up Hermes for Genobi…</p>
          <HermesProfileProgress state={step.state} />
        </>
      )}
      {step.kind === "sign-in" && (
        <>
          <p role="status">
            {SETUP_RUNNER_NAMES[step.runner]} is not signed in. Its sign-in is
            open in Terminal: finish there, then choose Check sign-in again.
          </p>
          <SetupHarnesses
            rows={step.rows}
            installed={{}}
            chosen={step.runner}
            local
            busy={false}
            hermes={{ model: "", provider: "" }}
            providerHeld
            onHermes={() => {}}
            onSignIn={onSignIn}
            onCheck={onCheck}
            modelChoice={false}
          />
        </>
      )}
      {step.kind === "mode" && (
        <>
          <p className="spawn-agent__lead">Where should Genobi work?</p>
          <ul className="spawn-agent__modes">
            <li>
              <strong>In Terminal</strong>
              <span>
                Genobi opens in a Terminal window, so you can watch it work and
                type to it. The bubble follows its paid steps for your approval.
              </span>
            </li>
            <li>
              <strong>In the bubble</strong>
              <span>
                Genobi runs inside the studio and answers in the Genobi bubble.
                Paid steps still wait for your approval.
              </span>
            </li>
          </ul>
          <div className="spawn-agent__actions">
            <button
              type="button"
              className="setup-primary"
              autoFocus
              onClick={() => onMode("terminal")}
            >
              Open in Terminal
            </button>
            <button type="button" onClick={() => onMode("headless")}>
              Run in the bubble instead
            </button>
          </div>
        </>
      )}
      {step.kind === "failed" && (
        <>
          <p role="alert">{step.text}</p>
          <button type="button" onClick={onCancel}>
            Close
          </button>
        </>
      )}
    </div>
  );
}

/**
 * No agent saved: pick one here, Hermes first when it is installed, else
 * Claude Code; Codex is listed but cannot run sessions. Hermes keeps an
 * open model from the list (DeepSeek V4.1 Flash on Nous by default).
 */
export function RunnerChooser({
  offer,
  onChoose,
}: {
  offer: RunnerOffer;
  onChoose: (pick: RunnerPick) => void;
}) {
  const [runner, setRunner] = useState<SetupRunner>(offer.suggested);
  const [hermes, setHermes] = useState({
    model: DEFAULT_HERMES_CHOICE.model,
    provider: DEFAULT_HERMES_CHOICE.provider,
  });
  const installed = (r: SetupRunner) =>
    !!offer.rows.find((row) => row.runner === r)?.installed;
  return (
    <form
      className="spawn-agent__choose"
      onSubmit={(event) => {
        event.preventDefault();
        onChoose(
          runner === "hermes"
            ? {
                runner,
                hermesModel: hermes.model.trim(),
                hermesProvider: hermes.provider.trim(),
              }
            : { runner },
        );
      }}
    >
      <p>Which agent should Genobi run as? It is saved for next time.</p>
      <fieldset>
        <legend>Your agent</legend>
        {SETUP_RUNNERS.map((r) => (
          <label key={r}>
            <input
              type="radio"
              name="spawn-runner"
              value={r}
              checked={runner === r}
              disabled={r === "codex" || !installed(r)}
              onChange={() => setRunner(r)}
            />
            <span>
              <strong>{SETUP_RUNNER_NAMES[r]}</strong>
              <small>
                {r === "codex"
                  ? "Not supported yet: the studio cannot run Codex sessions."
                  : installed(r)
                    ? r === offer.suggested
                      ? "Installed · suggested"
                      : "Installed"
                    : "Not found on this machine"}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      {runner === "hermes" && (
        <HermesModel hermes={hermes} onHermes={setHermes} />
      )}
      <button
        type="submit"
        className="setup-primary"
        disabled={
          !installed(runner) || (runner === "hermes" && !hermes.provider.trim())
        }
      >
        Use {SETUP_RUNNER_NAMES[runner]}
      </button>
    </form>
  );
}
