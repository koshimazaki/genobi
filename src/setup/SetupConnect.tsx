import { useCallback, useEffect, useState } from "react";
import { KeySlot, useLocalKeys } from "../components/LocalKeys";
import type { KeysStatus } from "../../shared/keys";
import type { KeyKind } from "../../shared/provider";
import {
  DEFAULT_HERMES_CHOICE,
  SETUP_RUNNERS,
  type AgentRunnerChoice,
  type AgentRunnerSettingState,
  type HarnessSignIn,
  type HermesProfileSetupState,
  type SetupRunner,
} from "../../shared/agent-runner-setting";
import {
  openSignIn,
  readRunnerSetting,
  readSignIn,
  runHermesProfile,
  saveRunnerSetting,
} from "./connect-api";
import { SetupHarnesses, type HermesFields } from "./SetupHarnesses";
import { SERVER_KEYS_CHANGED, type SetupDraft } from "./state";
import "./connect.css";

const SLOTS: readonly [KeyKind, string, string][] = [
  ["comfy", "Comfy API key", "comfyui-…"],
  ["bfl", "BFL API key (optional)", "BFL key"],
];

/** The key fields, or why this page cannot save keys. */
export function ConnectKeys({
  keys,
  onKeys,
}: {
  keys: KeysStatus | null;
  onKeys: (keys: KeysStatus) => void;
}) {
  if (!keys)
    return (
      <p role="status">
        Keys are saved by the local studio. On this website, connect your Comfy
        key from Settings; it stays in page memory for this visit.
      </p>
    );
  if (!keys.keychain)
    return (
      <p role="status">
        This server cannot save keys here (no macOS Keychain). Set
        COMFY_API_KEY, and BFL_API_KEY if you use it, in its environment, then
        restart it.
      </p>
    );
  return (
    <div className="setup-connect__keys">
      {SLOTS.map(([kind, label, placeholder]) => (
        <KeySlot
          key={kind}
          kind={kind}
          label={label}
          placeholder={placeholder}
          status={keys}
          onChange={onKeys}
        />
      ))}
      <p className="setup-footnote">
        Saved in this machine’s macOS Keychain. This page receives connection
        status only.
      </p>
    </div>
  );
}

/**
 * Hermes' model and provider as saved, or the default choice (DeepSeek V4.1
 * Flash on Nous) when none is, so the Hermes row signs in without typing.
 */
export function prefilledHermes(saved?: {
  hermesModel?: string;
  hermesProvider?: string;
}): HermesFields {
  return saved?.hermesModel || saved?.hermesProvider
    ? { model: saved.hermesModel ?? "", provider: saved.hermesProvider ?? "" }
    : {
        model: DEFAULT_HERMES_CHOICE.model,
        provider: DEFAULT_HERMES_CHOICE.provider,
      };
}

/**
 * What the step saves: the card chosen in this visit, else the runner saved
 * before, with Hermes' model and provider as shown.
 */
export function connectChoice(
  chosen: SetupRunner | undefined,
  setting: AgentRunnerSettingState | undefined,
  hermes: HermesFields,
): AgentRunnerChoice {
  return {
    runner: chosen ?? setting?.saved.runner ?? null,
    hermesModel: hermes.model.trim() || undefined,
    hermesProvider: hermes.provider.trim() || undefined,
  };
}

/**
 * Sign in: the harness signed in to is saved as the agent first, whichever
 * of the three it is (Hermes also signs in for the provider saved with it),
 * Hermes' `genobi` profile is set up when it is missing, then its own login
 * opens in Terminal.
 */
export async function saveAndSignIn(
  runner: SetupRunner,
  choice: AgentRunnerChoice,
  hooks: {
    profileMissing: boolean;
    onSaved: (state: AgentRunnerSettingState) => void;
    onProfile: (state: HermesProfileSetupState) => void;
    onProfileDone: () => void;
  },
) {
  hooks.onSaved(await saveRunnerSetting({ ...choice, runner }));
  if (runner === "hermes" && hooks.profileMissing) {
    await runHermesProfile(hooks.onProfile);
    hooks.onProfileDone();
  }
  await openSignIn(runner);
}

/**
 * Continue saves whenever a runner is known, chosen now or saved before, so
 * a later visit never leaves `.local/agent.json` unwritten. Only the local
 * studio has the route; nothing is saved without a runner.
 */
export const saveOnContinue = (local: boolean, choice: AgentRunnerChoice) =>
  local && choice.runner
    ? saveRunnerSetting(choice)
    : Promise.resolve(undefined);

/**
 * Setup's Connect step: the provider keys (`PUT /api/keys/:kind`), each
 * agent harness's sign-in, and the harness recorded on the server
 * (`POST /api/settings/agent-runner`) on Sign in and on Continue. "Decide
 * later" with nothing saved before leaves the server's setting as it is.
 */
export default function SetupConnect({
  draft,
  onHermes,
  next,
}: {
  draft: SetupDraft;
  /** Hermes' fields as the person types them, kept with the draft. */
  onHermes?: (hermes: HermesFields) => void;
  next: () => void;
}) {
  const { keys, setKeys, runners } = useLocalKeys();
  const [rows, setRows] = useState<HarnessSignIn[]>();
  const [setting, setSetting] = useState<AgentRunnerSettingState>();
  // Typed before a reload: kept over the saved choice the server reads.
  const [typed] = useState(draft.hermes);
  const [hermes, setHermes] = useState<HermesFields>(
    typed ?? prefilledHermes(),
  );
  const [profile, setProfile] = useState<HermesProfileSetupState>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const chosen = SETUP_RUNNERS.find((r) => r === draft.selection.agent);
  const [checked, setChecked] = useState(false);
  // Each read runs the harnesses' status commands again on the server.
  const check = useCallback((signal?: AbortSignal, manual = false) => {
    setRows(undefined);
    setChecked(false);
    readSignIn(signal).then(
      (answer) => {
        setRows(answer);
        setChecked(manual);
      },
      () => setRows([]),
    );
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    readRunnerSetting(controller.signal).then(
      (state) => {
        setSetting(state);
        if (!typed) setHermes(prefilledHermes(state.saved));
        check(controller.signal);
      },
      () => {},
    );
    return () => controller.abort();
  }, [check, typed]);
  const installed = Object.fromEntries(
    runners.map((r) => [r.id === "claude-code" ? "claude" : r.id, r.installed]),
  );
  const choice = () => connectChoice(chosen, setting, hermes);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const signIn = (runner: SetupRunner) =>
    act(async () => {
      await saveAndSignIn(runner, choice(), {
        profileMissing: !!rows?.some(
          (row) => row.runner === "hermes" && row.profile === "missing",
        ),
        onSaved: setSetting,
        onProfile: (state) => {
          setMessage("Setting up Hermes…");
          setProfile(state);
        },
        onProfileDone: () => check(),
      });
      setMessage(
        "Finish signing in in Terminal, then choose Check sign-in again.",
      );
    });
  const proceed = () =>
    act(async () => {
      const saved = await saveOnContinue(!!setting, choice());
      if (saved) setSetting(saved);
      next();
    });
  const keysSaved = (status: KeysStatus) => {
    setKeys(status);
    window.dispatchEvent(
      new CustomEvent(SERVER_KEYS_CHANGED, { detail: status }),
    );
  };
  return (
    <ConnectView
      keys={keys}
      onKeys={keysSaved}
      rows={rows}
      installed={installed}
      chosen={chosen}
      local={!!setting}
      environment={!!setting?.environment}
      busy={busy}
      hermes={hermes}
      providerHeld={!!setting?.hermesProvider}
      onHermes={(next) => {
        setHermes(next);
        onHermes?.(next);
      }}
      onSignIn={(runner) => void signIn(runner)}
      onCheck={() => check(undefined, true)}
      checked={checked}
      profile={profile}
      message={message}
      onContinue={() => void proceed()}
    />
  );
}

/** What the step shows, from what the container read; rendered in tests. */
export function ConnectView(
  props: {
    keys: KeysStatus | null;
    onKeys: (keys: KeysStatus) => void;
    environment: boolean;
    message: string;
    onContinue: () => void;
  } & Parameters<typeof SetupHarnesses>[0],
) {
  const { keys, onKeys, environment, message, onContinue, ...harness } = props;
  return (
    <div className="setup-connect">
      <p>
        Add your keys, then sign in to your agent with its own login. Nothing is
        charged here.
      </p>
      <ConnectKeys keys={keys} onKeys={onKeys} />
      <SetupHarnesses {...harness} />
      {environment && (
        <p role="status">
          GENOBI_AGENT_RUNNER is set on this server, so it picks the agent; the
          choice here is saved for when it is unset.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <button
        className="setup-primary"
        type="button"
        disabled={harness.busy}
        onClick={onContinue}
      >
        Continue <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
