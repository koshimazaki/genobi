/**
 * The one "Spawn agent" action (docs/agent-setup.md, "Spawn the agent"):
 * what setup's summary, the voice destinations, the Genobi bubble and the
 * Director call wherever the studio has no agent session to hand work to.
 * Against the local server, in order:
 *
 * 1. Read the runner status and the harness saved in setup.
 * 2. None saved (or Codex, which cannot run sessions): the person picks one
 *    in a small chooser, saved with `POST /api/settings/agent-runner`.
 * 3. Hermes' `genobi` profile missing: the existing profile setup runs, its
 *    progress shown.
 * 4. The harness says it is signed out: its own sign-in opens in Terminal
 *    and the action waits for "Check sign-in again". Hermes run in a
 *    Terminal window signs in inside that window instead, then chats there
 *    (`signIn` on the start), so nothing waits here.
 * 5. A caller that writes its prompt from the saved project
 *    (`writePrompt`, the Editor's Regenerate) writes it now, once the agent
 *    is ready, so setup comes before the save and nothing is retyped.
 * 6. The session starts, in a Terminal window when the server can open one
 *    (the person may run it in the bubble instead), with the open Director
 *    project linked through its owner copy's link code.
 *
 * The person's side is `SpawnUi`: the studio's dialog (`spawn-store.ts`) or
 * setup's summary, which has its own sign-in and cannot choose a harness.
 */
import type {
  AgentRunnerStatus,
  AgentSession,
  AgentSessionMode,
  AgentSessionRequest,
} from "../../shared/agent-session";
import {
  DEFAULT_HERMES_CHOICE,
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
} from "../setup/connect-api";
import { agentReadiness, SETUP_LOCAL_ONLY } from "../setup/handoff";
import { openCopyId } from "../voice/agent-client";
import {
  AgentRefusal,
  agentStatus,
  readAgentSession,
  startAgentSession,
} from "./api";
import { showAgentSession } from "./useAgentSession";

export type SpawnPhase =
  | "checking"
  | "saving"
  | "profile"
  | "sign-in"
  | "starting"
  /** The caller's `writePrompt` runs (Regenerate saves the project copy). */
  | "writing"
  /** Hermes signs in inside its Terminal window, then the chat starts. */
  | "terminal-sign-in"
  | "started";

/** What the chooser offers: each harness's row, and the one it suggests. */
export interface RunnerOffer {
  rows: readonly HarnessSignIn[];
  /** Hermes when it is installed, otherwise Claude Code. */
  suggested: SetupRunner;
}

/** A harness picked in the chooser, with Hermes' open model when it is Hermes. */
export type RunnerPick = Pick<
  AgentRunnerChoice,
  "hermesModel" | "hermesProvider"
> & { runner: SetupRunner };

export interface SpawnUi {
  phase?: (phase: SpawnPhase) => void;
  /** No harness saved: the person picks one. Absent, the action refuses. */
  choose?: (offer: RunnerOffer) => Promise<RunnerPick>;
  /** Hermes' profile setup, as each read answers. */
  profile?: (state: HermesProfileSetupState) => void;
  /**
   * The harness's sign-in is open in Terminal: resolves when the person
   * chose Check sign-in again. Absent, the action refuses with the reason.
   */
  signIn?: (
    runner: SetupRunner,
    rows: readonly HarnessSignIn[],
  ) => Promise<void>;
  /** Terminal or bubble, when the server can open a Terminal. */
  mode?: () => Promise<AgentSessionMode> | AgentSessionMode;
  /**
   * False where the caller signs the harness in itself (setup's summary):
   * a signed-out Hermes is refused with the reason rather than started in a
   * Terminal window that signs in first.
   */
  signInThere?: false;
  /** Throws when the person stopped the spawn; checked just before the start. */
  go?: () => void;
}

export interface SpawnRequest extends Omit<
  AgentSessionRequest,
  "mode" | "copyId"
> {
  /** The open Director project; its owner copy is linked when it has one. */
  projectId?: string;
  /** The harness the caller means (setup's card); never a silent substitute. */
  runner?: SetupRunner;
  /**
   * Writes the prompt once the agent is ready, before the copy is looked
   * up; its answer replaces `prompt`. Throwing `PromptWithheld` ends the
   * spawn with nothing started and no failure shown in the dialog.
   */
  writePrompt?: () => Promise<string>;
}

/** The caller withheld its prompt (`writePrompt`); `reason` is its own. */
export class PromptWithheld<T = unknown> extends Error {
  constructor(readonly reason: T) {
    super("Nothing was sent.");
  }
}

/** The first turn when the person starts Genobi without words of their own. */
export const OPEN_PROJECT_PROMPT =
  "Link my open Director project if there is one and look at where it stands, then ask me what I want to make. Quote nothing yet.";

/** The longest brief the bubble takes, well inside the start's 4,000. */
export const BRIEF_MAX = 3000;

/**
 * The first turn from the bubble's Start Genobi: the fixed opening when the
 * person typed nothing, else their brief after the same instruction to link
 * the open project, so a scripted check needs no microphone.
 */
export function startPrompt(brief = "") {
  const words = brief
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "") // eslint-disable-line no-control-regex
    .trim()
    .slice(0, BRIEF_MAX);
  return words
    ? `Link my open Director project if there is one, then do this. My brief: ${words}`
    : OPEN_PROJECT_PROMPT;
}

/** Said when nothing is saved and this caller cannot ask. */
export const NO_SAVED_RUNNER =
  "No agent is saved on this server yet. Choose Claude Code or Hermes in setup's Connect step (Sign in or Continue saves it), then start Genobi again.";

/** Hermes when it is installed, otherwise Claude Code. */
export function runnerOffer(rows: readonly HarnessSignIn[]): RunnerOffer {
  const hermes = rows.find((row) => row.runner === "hermes")?.installed;
  return { rows, suggested: hermes ? "hermes" : "claude" };
}

/** The choice saved for a pick: Hermes keeps an open model, the default first. */
export function pickChoice(
  pick: RunnerPick,
  saved?: AgentRunnerChoice,
): AgentRunnerChoice {
  const model = pick.hermesModel ?? saved?.hermesModel;
  const provider = pick.hermesProvider ?? saved?.hermesProvider;
  return {
    runner: pick.runner,
    hermesModel: model || DEFAULT_HERMES_CHOICE.model,
    hermesProvider: provider || DEFAULT_HERMES_CHOICE.provider,
  };
}

const status = () => agentStatus(AbortSignal.timeout(10_000));

/** Spawns the agent; throws an Error whose message is safe to show. */
export async function spawnAgent(
  request: SpawnRequest,
  ui: SpawnUi = {},
): Promise<AgentSession> {
  ui.phase?.("checking");
  let current = await status();
  const setting = await readRunnerSetting().catch(() => undefined);
  // The hosted studio has no setup routes: a paired runner still takes a
  // typed prompt in the bubble, but setup never starts there.
  if (!setting) {
    if (request.setup || !current.available)
      throw new Error(
        request.setup
          ? SETUP_LOCAL_ONLY
          : (current.message ?? SETUP_LOCAL_ONLY),
      );
    return start(request, "headless", ui);
  }
  const known = savedRunner(setting, current);
  const runner = known ?? (await pickRunner(setting, ui));
  // A new choice applies to the very next status read (no restart).
  if (!known) current = await status();
  if (current.setup === "hermes-profile") {
    ui.phase?.("profile");
    await runHermesProfile(ui.profile ?? (() => {}));
    current = await status();
  }
  // Each harness's sign-in opens once; Check sign-in again only re-reads.
  const opened = new Set<SetupRunner>();
  let mode: AgentSessionMode | undefined;
  let signInThere = false;
  for (;;) {
    const rows = await readSignIn();
    const readiness = agentReadiness(
      { selection: { agent: request.runner ?? runner } },
      current,
      rows,
    );
    if (readiness.ready) break;
    const row = rows.find((item) => item.runner === readiness.runner);
    const reason = readiness.reason ?? "No agent is set up on this server.";
    if (!readiness.runner || !signedOut(current, row)) throw new Error(reason);
    // Hermes in a Terminal window signs in there, then chats in the same
    // window: no separate wait here (Box 1.7).
    if (
      readiness.runner === "hermes" &&
      current.terminal &&
      ui.signInThere !== false
    ) {
      mode ??= await chooseMode(ui);
      if (mode === "terminal") {
        signInThere = true;
        break;
      }
    }
    if (!ui.signIn) throw new Error(reason);
    if (!opened.has(readiness.runner)) await openSignIn(readiness.runner);
    opened.add(readiness.runner);
    ui.phase?.("sign-in");
    await ui.signIn(readiness.runner, rows);
    current = await status();
  }
  mode ??= current.terminal ? await chooseMode(ui) : "headless";
  return start(request, mode, ui, signInThere);
}

const chooseMode = async (ui: SpawnUi) => (await ui.mode?.()) ?? "terminal";

/** Only a harness that is installed and says it is signed out signs in here. */
const signedOut = (status: AgentRunnerStatus, row?: HarnessSignIn) =>
  status.available && !!row?.installed && row.signedIn === false;

/**
 * The harness the server will run without asking: the environment's
 * (`GENOBI_AGENT_RUNNER` wins over setup), or the one saved in setup. Codex
 * is saved but cannot run sessions, so it counts as none.
 */
function savedRunner(
  setting: AgentRunnerSettingState,
  current: AgentRunnerStatus,
): SetupRunner | undefined {
  if (setting.environment) {
    if (!current.runner)
      throw new Error(current.message ?? "No agent is set up on this server.");
    return current.runner;
  }
  const saved = setting.saved.runner ?? undefined;
  return saved === "codex" ? undefined : saved;
}

/** The chooser's pick, saved before anything else happens. */
async function pickRunner(setting: AgentRunnerSettingState, ui: SpawnUi) {
  if (!ui.choose)
    throw new Error(
      setting.saved.runner === "codex" ? CODEX_SAVED : NO_SAVED_RUNNER,
    );
  const pick = await ui.choose(runnerOffer(await readSignIn()));
  ui.phase?.("saving");
  await saveRunnerSetting(pickChoice(pick, setting.saved));
  return pick.runner;
}

const CODEX_SAVED =
  "Codex is saved as your agent, but the studio cannot start Codex sessions yet. Choose Claude Code or Hermes in setup's Connect step.";

async function start(
  request: SpawnRequest,
  mode: AgentSessionMode,
  ui: SpawnUi,
  signIn = false,
) {
  let prompt = request.prompt;
  if (request.writePrompt) {
    ui.phase?.("writing");
    prompt = await request.writePrompt();
  }
  ui.phase?.(signIn ? "terminal-sign-in" : "starting");
  // After the prompt: a first save may be what creates the copy.
  const copyId = await openCopyId(request.projectId);
  // Closed while the project's copy was looked up: nothing starts.
  ui.go?.();
  const session = await startAgentSession({
    prompt,
    source: request.source,
    ...(request.context ? { context: request.context } : {}),
    ...(request.setup ? { setup: true as const } : {}),
    ...(copyId ? { copyId } : {}),
    // Absent means headless, as every older start was.
    ...(mode === "terminal" ? { mode } : {}),
    ...(signIn && mode === "terminal" ? { signIn: true as const } : {}),
  }).catch((error: unknown) => followBusy(error));
  // The server answers 201 for a start whose runner could not begin.
  if (session.status === "failed")
    throw new Error(session.summary ?? "The agent could not start.");
  showAgentSession(session);
  ui.phase?.("started");
  return session;
}

/** Said when the owner already has a session, which the bubble now shows. */
export const ALREADY_RUNNING =
  "Genobi is already running a session, now shown in the bubble. Stop it there to start another.";

/**
 * A start refused because the owner's session is still running (a Terminal
 * session outlives a reload): the bubble shows and follows that session,
 * and the refusal says so. Any other refusal is passed on.
 */
async function followBusy(error: unknown): Promise<never> {
  if (
    error instanceof AgentRefusal &&
    error.code === "agent_busy" &&
    error.sessionId
  ) {
    showAgentSession(await readAgentSession(error.sessionId));
    throw new Error(ALREADY_RUNNING);
  }
  throw error;
}
