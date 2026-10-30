import { registry } from "../../shared/registry";
import { matchesSelection } from "../../shared/licensing/selection";
import type {
  AgentRunnerStatus,
  AgentSessionRequest,
} from "../../shared/agent-session";
import {
  SETUP_RUNNER_NAMES,
  type HarnessSignIn,
  type SetupRunner,
} from "../../shared/agent-runner-setting";
import {
  KEY_SLOT_NAMES,
  LICENCE_STANCE_TEXT,
  licenceStance,
  runLocationText,
} from "../../shared/agent-setup";
import type { KeysStatus } from "../../shared/keys";
import type { KeyKind } from "../../shared/provider";
import type { SetupDraft } from "./state";

export function setupMatches(draft: SetupDraft) {
  return registry.filter(
    (entry) =>
      entry.status === "ready" && matchesSelection(entry, draft.selection),
  );
}

/** Whether setup's last step can start the configured harness, or why not. */
export interface AgentReadiness {
  ready: boolean;
  /** The harness setup chose, or the server's own when setup left it open. */
  runner?: SetupRunner;
  /** Still reading the server's agent status. */
  checking?: boolean;
  /** A sentence to show instead of a link; never a path or a key. */
  reason?: string;
  /** What setup can do about it here: set up Hermes' `genobi` profile. */
  setup?: "hermes-profile";
  /** The server can open the session in a Terminal window. */
  terminal?: boolean;
}

const CODEX =
  "Codex is your agent, but the studio cannot start Codex sessions yet. Choose Claude Code or Hermes in the Connect step, or use Codex with the Genobi plugin in your own terminal.";

/** No sign-in route: the hosted studio, where setup starts nothing. */
export const SETUP_LOCAL_ONLY =
  "Setup starts your agent from the local studio only. Open the local studio to finish setup; here you can still send typed prompts to a paired runner from the bubble.";

/**
 * Ready when this is the local studio (its sign-in route answered), the
 * server can start a session (`GET /api/agent/status`), its runner is the one
 * setup chose (never a silent substitute) and the harness's own status command
 * does not say it is signed out. `signIn` is undefined while it is read and
 * null when the route is missing: a hosted studio, even with a paired runner,
 * never starts setup's session.
 */
export function agentReadiness(
  draft: SetupDraft,
  status: AgentRunnerStatus | undefined,
  signIn: readonly HarnessSignIn[] | null | undefined,
): AgentReadiness {
  const chosen = draft.selection.agent;
  const runner: SetupRunner | undefined =
    chosen && chosen !== "any" ? chosen : status?.runner;
  if (runner === "codex") return { ready: false, runner, reason: CODEX };
  if (signIn === null)
    return { ready: false, runner, reason: SETUP_LOCAL_ONLY };
  if (!status || !signIn) return { ready: false, runner, checking: true };
  if (!status.available)
    return {
      ready: false,
      runner,
      reason: status.message ?? "No agent is set up on this server.",
      ...(status.setup ? { setup: status.setup } : {}),
    };
  if (!status.runner || (runner && status.runner !== runner))
    return {
      ready: false,
      runner,
      reason: `This server runs ${status.runner ? SETUP_RUNNER_NAMES[status.runner] : "no agent"}, not ${runner ? SETUP_RUNNER_NAMES[runner] : "an agent"}: GENOBI_AGENT_RUNNER may be set. Genobi will not start another agent in its place.`,
    };
  const row = signIn.find((item) => item.runner === status.runner);
  if (row?.signedIn === false)
    return {
      ready: false,
      runner: status.runner,
      reason: `${SETUP_RUNNER_NAMES[status.runner]} is not signed in. Sign in, then check again.`,
    };
  return {
    ready: true,
    runner: status.runner,
    ...(status.terminal ? { terminal: true } : {}),
  };
}

/** How voice stands when the session starts. */
export type SetupVoiceState = "installed" | "failed" | "unavailable" | "off";

const VOICE_TEXT: Record<SetupVoiceState, string> = {
  installed: "installed; the studio gives you the model's folder",
  failed: "requested, but the install did not finish",
  unavailable: "requested, but this machine cannot install it",
  off: "not requested",
};

/**
 * What the person "says" to the agent at the end of setup: their choices in
 * words. Key slot names only: the page never holds a key. The voice model's
 * folder is added by the server from its own settings, not from this page.
 */
export function setupStartPrompt(
  draft: SetupDraft,
  runner: SetupRunner,
  keys: KeysStatus | null,
  voice: SetupVoiceState,
) {
  const stance = licenceStance(draft.usage);
  const connected = keys
    ? (Object.keys(KEY_SLOT_NAMES) as KeyKind[])
        .filter((kind) => keys[kind]?.connected)
        .map((kind) => KEY_SLOT_NAMES[kind])
    : [];
  return [
    "Genobi setup just finished. Check that my studio is ready for these choices, then tell me what I can make first.",
    `Agent: ${SETUP_RUNNER_NAMES[runner]}.`,
    `Generation runs ${runLocationText(draft.selection.execution)}.`,
    `Keys connected: ${connected.join(", ") || "none yet"}.`,
    `Licence: ${stance ? LICENCE_STANCE_TEXT[stance] : "not chosen"}.`,
    `Voice: ${VOICE_TEXT[voice]}.`,
    "Do not install software, download models, change keys or submit paid generation.",
  ].join("\n");
}

/** The start request: typed, the setup mark, and the person's choices. */
export function setupStartRequest(
  draft: SetupDraft,
  runner: SetupRunner,
  keys: KeysStatus | null,
  voice: SetupVoiceState,
): AgentSessionRequest {
  return {
    prompt: setupStartPrompt(draft, runner, keys, voice),
    source: "typed",
    setup: true,
    context: {
      picks: [],
      selection: draft.selection,
      ...(draft.usage ? { usage: draft.usage } : {}),
    },
  };
}
