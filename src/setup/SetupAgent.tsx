import { useCallback, useEffect, useState } from "react";
import type { AgentRunnerStatus } from "../../shared/agent-session";
import {
  SETUP_RUNNER_NAMES,
  type HarnessSignIn,
  type HermesProfileSetupState,
} from "../../shared/agent-runner-setting";
import { agentStatus } from "../agent/api";
import { setPrefersTerminal, usePrefersTerminal } from "../agent/spawn-store";
import { openSignIn, readSignIn, runHermesProfile } from "./connect-api";
import { HermesProfileProgress } from "./HermesProfileProgress";
import { InstallWait } from "./InstallWait";
import { agentReadiness, setupMatches, type AgentReadiness } from "./handoff";
import type { SetupStartSnapshot } from "./start-store";
import type { SetupDraft } from "./state";

/** The harness's own answer, in words. */
export const signInText = (signedIn?: HarnessSignIn["signedIn"]) =>
  signedIn === true
    ? "signed in"
    : signedIn === false
      ? "not signed in"
      : "sign-in state unknown";

/**
 * The summary step's read of the configured harness: the server's agent
 * status and each harness's sign-in, while the step is open. `recheck` runs
 * both again (the sign-in probe re-runs on the server, never cached) and
 * marks the answer as checked just now; `signIn` opens the harness's own
 * login in Terminal, as the Connect step does; `setUpHermes` sets up Hermes'
 * `genobi` profile from the saved choice, then checks again.
 */
export function useSetupAgent(active: boolean, draft: SetupDraft) {
  const [status, setStatus] = useState<AgentRunnerStatus>();
  // undefined while read; null where the route is missing (the hosted studio).
  const [rows, setRows] = useState<HarnessSignIn[] | null>();
  const [check, setCheck] = useState(0);
  const [message, setMessage] = useState("");
  /** Set when a Check again's answer arrived, for "checked just now". */
  const [checked, setChecked] = useState(false);
  const [profile, setProfile] = useState<HermesProfileSetupState>();
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15_000),
    ]);
    setStatus(undefined);
    void agentStatus(signal).then(setStatus, () => {});
    // The hosted studio has no sign-in route: null, and setup starts nothing.
    setRows(undefined);
    setChecked(false);
    readSignIn(signal).then(
      (answer) => {
        setRows(answer);
        setChecked(check > 0);
      },
      () => {
        if (!controller.signal.aborted) setRows(null);
      },
    );
    return () => controller.abort();
  }, [active, check]);
  const readiness = agentReadiness(draft, status, rows);
  const recheck = useCallback(() => {
    setMessage("");
    setCheck((value) => value + 1);
  }, []);
  const signIn = useCallback(async () => {
    if (!readiness.runner) return;
    try {
      await openSignIn(readiness.runner);
      setMessage("Finish signing in in Terminal, then choose Check again.");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, [readiness.runner]);
  const setUpHermes = useCallback(async () => {
    setMessage("");
    try {
      await runHermesProfile(setProfile);
      setCheck((value) => value + 1);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, []);
  return {
    readiness,
    rows,
    recheck,
    signIn,
    setUpHermes,
    profile,
    checked,
    message,
  };
}

/**
 * "Your agent" on the summary: what Save & set up will start, or why it
 * cannot, with Sign in and Check again in the same place. No documentation
 * link: the harness choice and its sign-in are the setup.
 */
export function SetupAgentView({
  draft,
  installVoice,
  readiness,
  rows,
  start,
  message,
  onSignIn,
  onCheck,
  checked = false,
  profile,
  onSetUpHermes = () => {},
}: {
  draft: SetupDraft;
  /** Save & set up installs voice before it starts the agent. */
  installVoice: boolean;
  readiness: AgentReadiness;
  rows?: readonly HarnessSignIn[] | null;
  start: SetupStartSnapshot;
  message: string;
  onSignIn: () => void;
  onCheck: () => void;
  /** A Check again just answered: say so beside the result. */
  checked?: boolean;
  profile?: HermesProfileSetupState;
  onSetUpHermes?: () => void;
}) {
  const name = readiness.runner && SETUP_RUNNER_NAMES[readiness.runner];
  const row = rows?.find((item) => item.runner === readiness.runner);
  // Terminal is the preferred experience where the server can open one.
  const native = usePrefersTerminal() && !!readiness.terminal;
  return (
    <section className="setup-agent" aria-label="Your agent">
      <h3>Your agent{name ? `: ${name}` : ""}</h3>
      {!setupMatches(draft).length && (
        <p role="status">
          No ready creative model matches these choices. Change the model or
          location preference; Genobi will not silently use another route.
        </p>
      )}
      {readiness.checking ? (
        <p role="status">Checking your agent…</p>
      ) : readiness.ready ? (
        <>
          <p>
            {installVoice
              ? "Save & set up installs voice, then starts"
              : "Save & start Genobi starts"}{" "}
            {name} as Genobi with these choices.{" "}
            {native
              ? "It opens in a Terminal window you can watch and type into; the bubble follows it."
              : "It opens in the Genobi bubble."}{" "}
            Paid steps still wait for your approval.
          </p>
          {readiness.terminal && (
            <button type="button" onClick={() => setPrefersTerminal(!native)}>
              {native
                ? "Run in the bubble instead"
                : "Open in Terminal instead"}
            </button>
          )}
        </>
      ) : (
        <>
          <p role="alert">{readiness.reason}</p>
          <div className="setup-agent__actions">
            {readiness.setup === "hermes-profile" ? (
              <button
                type="button"
                className="setup-primary"
                disabled={profile?.phase === "running"}
                onClick={onSetUpHermes}
              >
                {profile?.phase === "running"
                  ? "Setting up Hermes…"
                  : "Set up Hermes"}
              </button>
            ) : (
              readiness.runner &&
              row?.installed && (
                <button type="button" onClick={onSignIn}>
                  Sign in to {name}
                </button>
              )
            )}
            <button type="button" onClick={onCheck}>
              Check again
            </button>
          </div>
        </>
      )}
      <InstallWait kind="hermes" active={profile?.phase === "running"}>
        <HermesProfileProgress state={profile} />
      </InstallWait>
      {name && row && !readiness.checking && (
        <p role="status" className="setup-agent__signed-in">
          {name}: {signInText(row.signedIn)}
          {checked && <small> · checked just now</small>}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {start.phase === "voice" && readiness.ready && (
        <p role="status">Genobi starts once voice is connected.</p>
      )}
      {start.phase === "starting" && <p role="status">Starting {name}…</p>}
      {(start.phase === "failed" || start.phase === "voice-failed") && (
        <p role="alert">{start.message}</p>
      )}
    </section>
  );
}
