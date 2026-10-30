// Setting up Hermes' `genobi` profile, shared by the studio's
// `POST /api/agent/hermes-profile` (setup's "Set up Hermes") and
// `npm run agent:hermes-profile`: the same checks and the same Hermes
// commands, run without a shell (`runHermes` is execFile with argument
// arrays). It creates the profile only when it is missing, sets Genobi's keys
// in that profile alone, then checks the open route. It reads no credential,
// calls no model and logs nothing; Hermes' output stays in the child.
import path from "node:path";
import { agentConfig, type AgentConfig } from "./agent-config";
import {
  applyProfile,
  createProfile,
  profileEnv,
  profileSettings,
  runHermes,
  type HermesRun,
} from "./agent-hermes-profile";
import { assertOpenProfile, OpenRouteError } from "./agent-hermes-pins";
import { assertOpenRoute } from "./agent-hermes-probe";
import type { AgentRunnerSetting } from "./agent-runner-setting";
import { AppError } from "./errors";
import { OPEN_ROUTE_REFUSAL } from "../shared/open-route";
import type {
  HermesProfileSetupState,
  ProfileSetupStep,
  ProfileStepOutcome,
} from "../shared/agent-runner-setting";

/** Why the profile cannot be set up from this configuration. */
export type ProfileSetupProblem =
  "hermes" | "root" | "invalid" | "closed" | "choice" | "studio";

/** Checks made before anything is created or run. */
export function profileSetupProblem(
  config: AgentConfig,
  studio: string,
): ProfileSetupProblem | undefined {
  if (!config.hermes) return "hermes";
  if (!config.hermesHome) return "root";
  if (config.hermesInvalid) return "invalid";
  if (config.hermesClosed) return "closed";
  if (!config.hermesModel || !config.hermesProvider) return "choice";
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(studio))
    return "studio";
  return undefined;
}

/** The studio's sentences: what to do in setup, never a script or a restart. */
export const STUDIO_PROBLEMS: Record<ProfileSetupProblem, string> = {
  hermes:
    "Hermes was not found on this machine. Install Hermes, then choose Set up Hermes again.",
  root: "Hermes' root folder is not known on this server: set GENOBI_AGENT_HERMES_ROOT to an absolute folder, or HOME.",
  invalid:
    "Hermes' model or provider is not a valid name. Choose one from the list in setup's Connect step.",
  closed: OPEN_ROUTE_REFUSAL,
  choice:
    "Choose Hermes' open model in setup's Connect step first; DeepSeek V4.1 Flash on Nous is the default.",
  studio: "The studio's own address must be a local one.",
};

/**
 * A failure as a sentence safe to show: the open-route refusals and the
 * profile code's own fixed sentences ("hermes config set failed."); any
 * other error (a file system one names a path) becomes a fixed sentence.
 * Hermes' output is never kept.
 */
export function setupError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (
    error instanceof OpenRouteError ||
    /^hermes [a-z]+(?: [a-z-]+)? failed\.$/.test(message) ||
    message.startsWith("The profile's plugins/genobi is a folder")
  )
    return message;
  return "Hermes could not be set up. Check that its root folder can be written, then try again.";
}

/** The configuration a profile setup uses: Hermes, with the saved choice. */
export const hermesSetupConfig = (
  env: NodeJS.ProcessEnv,
  saved: Parameters<typeof agentConfig>[1],
) => agentConfig({ ...env, GENOBI_AGENT_RUNNER: "hermes" }, saved);

export interface ProfileSetupOptions {
  /** Hermes' own commands; tests replace them. Defaults to the binary. */
  run?: HermesRun;
  onStep?: (step: ProfileSetupStep, outcome: ProfileStepOutcome) => void;
}

/**
 * Creates the profile when it is missing, sets Genobi's keys in it (the
 * plugin, the Genobi MCP server with its tool filter, the browser, and the
 * open model and provider with fallback off) and checks Hermes resolves the
 * route to an open endpoint. Call `profileSetupProblem` first.
 */
export async function setupHermesProfile(
  config: AgentConfig,
  studio: string,
  env: NodeJS.ProcessEnv,
  options: ProfileSetupOptions = {},
) {
  const step = options.onStep ?? (() => {});
  const home = config.hermesHome!;
  const root = path.dirname(path.dirname(home));
  const run = options.run ?? runHermes(config.hermes!);
  step("create", "running");
  const created = await createProfile(root, run, env);
  step("create", "done");
  step("apply", "running");
  const settings = profileSettings(config, studio);
  await applyProfile(home, settings, run, env, true);
  step("apply", "done");
  step("verify", "running");
  await assertOpenProfile(home);
  await assertOpenRoute(run.probe, profileEnv(home, env), settings);
  step("verify", "done");
  return { created, home, root };
}

/**
 * One profile setup at a time, for the person's studio session that
 * started it, polled through `GET /api/agent/hermes-profile`. When it is
 * done the runner's configuration is read again, so the next status read
 * and session use the profile without a restart.
 */
export class HermesProfileSetup {
  private state: HermesProfileSetupState = { phase: "idle", steps: {} };
  private owner?: string;
  private task?: Promise<void>;
  private busy = false;
  constructor(
    private readonly setting: AgentRunnerSetting,
    private readonly studio: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly run?: (binary: string) => HermesRun,
  ) {}

  status(owner: string): HermesProfileSetupState {
    return this.owner === owner
      ? { ...this.state, steps: { ...this.state.steps } }
      : { phase: "idle", steps: {} };
  }

  /** Refuses with the reason before anything runs; otherwise starts it. */
  async start(owner: string) {
    // Reserved before the first await: only one setup holds the slot.
    if (this.busy) throw new AppError(409, "Hermes is already being set up.");
    this.busy = true;
    let config: AgentConfig;
    try {
      config = await hermesSetupConfig(this.env, this.setting.state().saved);
      const problem = profileSetupProblem(config, this.studio);
      if (problem)
        throw new AppError(400, STUDIO_PROBLEMS[problem], "hermes_profile");
    } catch (error) {
      this.busy = false;
      throw error;
    }
    this.owner = owner;
    this.state = { phase: "running", steps: { check: "done" } };
    const mark = (step: ProfileSetupStep, outcome: ProfileStepOutcome) => {
      this.state.steps = { ...this.state.steps, [step]: outcome };
    };
    this.task = setupHermesProfile(config, this.studio, this.env, {
      run: this.run?.(config.hermes!),
      onStep: mark,
    })
      .then(async ({ created }) => {
        await this.setting.refresh();
        this.state = { ...this.state, phase: "done", created };
      })
      .catch((error: Error) => {
        const running = Object.entries(this.state.steps).find(
          ([, outcome]) => outcome === "running",
        )?.[0] as ProfileSetupStep | undefined;
        if (running) mark(running, "failed");
        this.state = {
          ...this.state,
          phase: "failed",
          error: setupError(error),
        };
      })
      .finally(() => {
        this.busy = false;
      });
    return this.status(owner);
  }

  /** Waits for a running setup (tests and shutdown). */
  settled() {
    return this.task ?? Promise.resolve();
  }
}
