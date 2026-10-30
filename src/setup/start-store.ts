import { useSyncExternalStore } from "react";
import type { HarnessSignIn } from "../../shared/agent-runner-setting";
import type { KeysStatus } from "../../shared/keys";
import { agentStatus } from "../agent/api";
import { NO_SAVED_RUNNER, spawnAgent } from "../agent/spawn";
import { prefersTerminal } from "../agent/spawn-store";
import { request } from "../useJobs";
import {
  findVoiceModels,
  onVoiceReady,
  startVoiceInstall,
  subscribeVoiceInstall,
  voiceInstall,
} from "../voice/install-store";
import {
  SETUP_LOCAL_ONLY,
  setupStartRequest,
  type SetupVoiceState,
} from "./handoff";
import { saveSetup, type SetupDraft } from "./state";

/**
 * Setup's single primary action, outside any component so the dialog can be
 * closed while voice installs: save the choices, install voice when that was
 * ticked, then start ONE agent session through the shared spawn action
 * (`src/agent/spawn.ts`: typed, marked `setup`), in a Terminal window or the
 * Genobi bubble. With voice ticked the agent waits for VOICE_READY; a failed
 * or cancelled install offers "Start Genobi anyway" instead.
 */
export type SetupStartPhase =
  "idle" | "voice" | "voice-failed" | "starting" | "started" | "failed";
export interface SetupStartSnapshot {
  phase: SetupStartPhase;
  /** A sentence safe to show: the server's refusal or the install's error. */
  message: string;
}
let snapshot: SetupStartSnapshot = { phase: "idle", message: "" };
const listeners = new Set<() => void>();
function update(next: SetupStartSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}
export const setupStart = () => snapshot;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export function useSetupStart() {
  return useSyncExternalStore(subscribe, setupStart, setupStart);
}

export interface SaveAndStart {
  /** Install voice first (the footer's `offersVoiceInstall`). */
  installVoice: boolean;
  /** Start the agent at the end; false when the summary showed a reason. */
  startAgent: boolean;
  /** Voice was already connected when the summary was read. */
  voiceConnected?: boolean;
  /** The sign-in rows the summary read; null on a studio without the route. */
  signIn?: readonly HarnessSignIn[] | null;
  /** Called once the session is open, to close the dialog. */
  onStarted: () => void;
}

const busy = () => snapshot.phase === "voice" || snapshot.phase === "starting";

export async function saveAndStart(draft: SetupDraft, options: SaveAndStart) {
  if (busy()) return;
  saveSetup(draft);
  if (!options.installVoice) {
    if (options.startAgent)
      await startSetupAgent(
        draft,
        // Ticked but not offered: the installer's check said it cannot here.
        !draft.voice
          ? "off"
          : options.voiceConnected
            ? "installed"
            : "unavailable",
        options,
      );
    return;
  }
  update({ phase: "voice", message: "" });
  const stops: (() => void)[] = [];
  const stop = () => stops.splice(0).forEach((off) => off());
  stops.push(
    onVoiceReady(window, () => {
      stop();
      if (options.startAgent) void startSetupAgent(draft, "installed", options);
      else update({ phase: "idle", message: "" });
    }),
  );
  // An install that ends without Ready (error, cancel, a refused start).
  stops.push(
    subscribeVoiceInstall(() => {
      const install = voiceInstall();
      if (install.pending || install.state?.busy) return;
      const ended =
        install.state?.phase === "error" ||
        install.state?.phase === "cancelled";
      if (!ended && !install.error) return;
      stop();
      update({
        phase: "voice-failed",
        message:
          install.state?.error ||
          install.error ||
          (install.state?.phase === "cancelled"
            ? "Voice setup was cancelled."
            : "Voice setup did not finish."),
      });
    }),
  );
  // The model already on this machine comes before any download.
  if (!voiceInstall().found) await findVoiceModels();
  await startVoiceInstall(draft.voiceFolder, chosenVoiceModel(draft));
}

/** The found model setup uses: the one chosen, else the first; null downloads. */
export function chosenVoiceModel(draft: SetupDraft) {
  if (draft.voiceModel === null) return undefined;
  const found = voiceInstall().found ?? [];
  return (
    found.find((model) => model.folder === draft.voiceModel)?.folder ??
    found[0]?.folder
  );
}

/** After a failed voice install: the agent starts without it. */
export const startAnyway = (
  draft: SetupDraft,
  options: Pick<SaveAndStart, "signIn" | "onStarted">,
) =>
  snapshot.phase === "voice-failed"
    ? startSetupAgent(draft, "failed", options)
    : Promise.resolve();

async function startSetupAgent(
  draft: SetupDraft,
  voice: SetupVoiceState,
  options: Pick<SaveAndStart, "signIn" | "onStarted">,
) {
  update({ phase: "starting", message: "" });
  try {
    // The summary's rows: the hosted studio (no sign-in route) starts nothing.
    if (options.signIn === null) throw new Error(SETUP_LOCAL_ONLY);
    const chosen = draft.selection.agent;
    // The runner the start names: the card chosen, else the one the server
    // will run (read again; it may have changed since the summary opened).
    const runner =
      chosen && chosen !== "any"
        ? chosen
        : (await agentStatus(AbortSignal.timeout(10_000))).runner;
    if (!runner) throw new Error(NO_SAVED_RUNNER);
    // Connected or not, by slot: the page never holds a key.
    const keys = await request<{ keys: KeysStatus }>("/api/keys").then(
      (answer) => answer.keys,
      () => null,
    );
    // The one spawn action. Setup chose the harness and signs it in on the
    // summary, so it neither asks, opens a sign-in nor starts a Terminal
    // window that signs in first (`signInThere: false`): a missing runner or
    // a signed-out harness is refused with the reason, never "started".
    await spawnAgent(
      { ...setupStartRequest(draft, runner, keys, voice), runner },
      {
        mode: () => (prefersTerminal() ? "terminal" : "headless"),
        signInThere: false,
      },
    );
    update({ phase: "started", message: "" });
    options.onStarted();
  } catch (error) {
    update({ phase: "failed", message: (error as Error).message });
  }
}

/** A new setup pass starts clean (the dialog reopens on the welcome). */
export function resetSetupStart() {
  if (!busy()) update({ phase: "idle", message: "" });
}
