import {
  HERMES_CHOICES,
  hermesChoiceOf,
  SETUP_RUNNER_NAMES,
  SETUP_RUNNERS,
  type HarnessSignIn,
  type HermesProfileSetupState,
  type SetupRunner,
  type SignedIn,
} from "../../shared/agent-runner-setting";
import { HermesProfileProgress } from "./HermesProfileProgress";

export interface HermesFields {
  model: string;
  provider: string;
}

const signedInText = (found: boolean, signedIn: SignedIn) =>
  !found
    ? "Not found on this machine"
    : signedIn === true
      ? "Signed in"
      : signedIn === false
        ? "Not signed in"
        : "Sign-in state unknown";

/**
 * One row per harness: installed (from `/api/agent/runners` or the sign-in
 * check), signed in where its own status command can say, and a Sign in
 * button that opens that harness's own login in Terminal. Genobi stores no
 * agent credential; it only asks the harness.
 */
export function SetupHarnesses({
  rows,
  installed,
  chosen,
  local,
  busy,
  hermes,
  providerHeld,
  onHermes,
  onSignIn,
  onCheck,
  profile,
  checked = false,
  modelChoice = true,
}: {
  rows?: readonly HarnessSignIn[];
  /** `GET /api/agent/runners`, by runner. */
  installed: Partial<Record<SetupRunner, boolean>>;
  chosen?: SetupRunner;
  /** False on the hosted studio, which cannot open a local Terminal. */
  local: boolean;
  busy: boolean;
  hermes: HermesFields;
  /**
   * The server already holds a Hermes provider (saved, or
   * `GENOBI_AGENT_HERMES_PROVIDER`), so Hermes can sign in without one typed.
   */
  providerHeld: boolean;
  onHermes: (fields: HermesFields) => void;
  onSignIn: (runner: SetupRunner) => void;
  onCheck: () => void;
  /** Hermes' profile being set up before its sign-in, as the server reports it. */
  profile?: HermesProfileSetupState;
  /** A Check sign-in again just answered. */
  checked?: boolean;
  /**
   * Offer Hermes' model list here. The spawn dialog's sign-in step passes
   * false: the model was picked and saved before Hermes was set up.
   */
  modelChoice?: boolean;
}) {
  const hermesRow = rows?.find((item) => item.runner === "hermes");
  const hermesFound = !!installed.hermes || !!hermesRow?.installed;
  // Shown while Hermes is the agent, or while its row needs a provider; keyed
  // to the server's state, so typing a provider does not hide the fields.
  const hermesFields =
    modelChoice &&
    local &&
    (chosen === "hermes" || (hermesFound && !providerHeld));
  return (
    <section className="setup-connect__harnesses" aria-label="Agent sign-in">
      <h3>Sign in to your agent</h3>
      <ul>
        {SETUP_RUNNERS.map((runner) => {
          const row = rows?.find((item) => item.runner === runner);
          const found = !!installed[runner] || !!row?.installed;
          const needsProvider =
            runner === "hermes" && !providerHeld && !hermes.provider.trim();
          return (
            <li key={runner} data-chosen={chosen === runner}>
              <span
                className={`connection-dot ${row?.signedIn === true ? "connected" : ""}`}
              />
              <span>
                <strong>{SETUP_RUNNER_NAMES[runner]}</strong>
                {chosen === runner && " · your agent"}
                <small>
                  {!local
                    ? "Sign in from the local studio"
                    : !rows
                      ? "Checking sign-in…"
                      : signedInText(found, row?.signedIn ?? "unknown")}
                </small>
                {row?.note && <small>{row.note}</small>}
                {runner === "codex" && chosen === "codex" && (
                  <small>
                    Codex is recorded as your agent, but the studio cannot run
                    Codex sessions yet. Use it with the Genobi plugin in your
                    own terminal.
                  </small>
                )}
                {needsProvider && hermesFields && (
                  <small>Choose Hermes’ open provider below to sign in.</small>
                )}
              </span>
              <button
                type="button"
                disabled={!local || busy || !found || needsProvider}
                onClick={() => onSignIn(runner)}
              >
                {row?.profile === "missing" ? "Set up & sign in" : "Sign in"}
              </button>
            </li>
          );
        })}
      </ul>
      {hermesFields && <HermesModel hermes={hermes} onHermes={onHermes} />}
      <HermesProfileProgress state={profile} />
      {local && (
        <button type="button" disabled={busy} onClick={onCheck}>
          Check sign-in again
        </button>
      )}
      {checked && <small role="status"> Checked just now.</small>}
    </section>
  );
}

/** The "Other" entry: the model and provider are typed. */
const OTHER = "other";

/**
 * Hermes' open model as a short list from LICENCES.md, DeepSeek V4.1 Flash
 * on Nous first and prefilled, so Sign in works without typing a name.
 * "Other open model…" keeps a typed model and provider; an Anthropic or
 * OpenAI one is still refused by the server.
 */
export function HermesModel({
  hermes,
  onHermes,
}: {
  hermes: HermesFields;
  onHermes: (fields: HermesFields) => void;
}) {
  const listed = hermesChoiceOf(hermes.model, hermes.provider);
  return (
    <div className="setup-connect__hermes">
      <label>
        Hermes model
        <select
          value={listed?.model ?? OTHER}
          onChange={(e) => {
            const choice = HERMES_CHOICES.find(
              (item) => item.model === e.target.value,
            );
            onHermes(
              choice
                ? { model: choice.model, provider: choice.provider }
                : { model: "", provider: "" },
            );
          }}
        >
          {HERMES_CHOICES.map((choice) => (
            <option key={choice.model} value={choice.model}>
              {choice.label} · {choice.note}
            </option>
          ))}
          <option value={OTHER}>Other open model…</option>
        </select>
      </label>
      {!listed && (
        <>
          <label>
            Model id
            <input
              value={hermes.model}
              maxLength={128}
              placeholder={HERMES_CHOICES[0].model}
              autoComplete="off"
              onChange={(e) => onHermes({ ...hermes, model: e.target.value })}
            />
          </label>
          <label>
            Hermes provider
            <input
              value={hermes.provider}
              maxLength={64}
              placeholder={HERMES_CHOICES[0].provider}
              autoComplete="off"
              onChange={(e) =>
                onHermes({ ...hermes, provider: e.target.value })
              }
            />
          </label>
        </>
      )}
      <small>
        Open models only: an Anthropic or OpenAI model or provider is refused.
      </small>
    </div>
  );
}
