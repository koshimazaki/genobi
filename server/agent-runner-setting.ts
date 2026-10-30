import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "./errors";
import { agentConfig, type AgentConfig } from "./agent-config";
import { OPEN_ROUTE_REFUSAL, openRouteRefusal } from "../shared/open-route";
import {
  HERMES_MODEL,
  HERMES_PROVIDER,
  SETUP_RUNNERS,
  type AgentRunnerChoice,
  type AgentRunnerSettingState,
  type SetupRunner,
} from "../shared/agent-runner-setting";

/** In the server's `.local` folder, beside the store. */
export const AGENT_RUNNER_FILE = "agent.json";

const invalid = (message: string) =>
  new AppError(400, message, "agent_runner_invalid");

/** A name field: absent, or a valid name once control characters are gone. */
function nameField(value: unknown, rule: RegExp, label: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw invalid(`${label} must be text.`);
  const text = value.replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!text) return undefined;
  if (!rule.test(text)) throw invalid(`${label} is not a valid name.`);
  return text;
}

/**
 * Validates a choice: a runner setup offers (or `null` for none), and for
 * Hermes an open model and provider. An Anthropic or OpenAI one is refused
 * here, before anything is written, as the profile setup refuses it.
 */
export function parseAgentRunnerChoice(value: unknown): AgentRunnerChoice {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid("Send a JSON object.");
  const { runner, hermesModel, hermesProvider, ...rest } = value as Record<
    string,
    unknown
  >;
  if (Object.keys(rest).length)
    throw invalid("Send only runner, hermesModel and hermesProvider.");
  if (runner !== null && !SETUP_RUNNERS.includes(runner as SetupRunner))
    throw invalid("Choose Claude Code, Hermes, Codex or none.");
  const model = nameField(hermesModel, HERMES_MODEL, "Hermes' model");
  // Lower-cased as Hermes keys it, as agent-config.ts does.
  const provider = nameField(
    hermesProvider,
    HERMES_PROVIDER,
    "Hermes' provider",
  )?.toLowerCase();
  if (openRouteRefusal(model ?? "", provider ?? ""))
    throw new AppError(400, OPEN_ROUTE_REFUSAL, "closed_route");
  return {
    runner: runner as SetupRunner | null,
    ...(model ? { hermesModel: model } : {}),
    ...(provider ? { hermesProvider: provider } : {}),
  };
}

/** The saved choice, or undefined when there is none or it does not parse. */
export async function readAgentRunnerChoice(directory: string) {
  try {
    const text = await readFile(
      path.join(directory, AGENT_RUNNER_FILE),
      "utf8",
    );
    return parseAgentRunnerChoice(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/**
 * The configuration a tool outside the server resolves, such as
 * `npm run agent:hermes-profile`: the environment, with the choice saved in
 * `directory` (the studio's `.local`) under it, as the server reads it.
 */
export async function savedAgentConfig(
  directory: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  return agentConfig(env, await readAgentRunnerChoice(directory));
}

/**
 * The harness chosen in setup, as a server setting. `config` is the object
 * the agent sessions hold: built from the environment with the saved choice
 * under it, and rebuilt in place on each save, so a new choice applies to
 * the next status read and session without a restart. A configuration a
 * test injects is held as given and never rebuilt.
 */
export class AgentRunnerSetting {
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(
    private readonly directory: string,
    private readonly env: NodeJS.ProcessEnv,
    readonly config: AgentConfig,
    private readonly live: boolean,
    private saved?: AgentRunnerChoice,
  ) {}

  static async load(
    directory: string,
    injected?: AgentConfig,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    const saved = await readAgentRunnerChoice(directory);
    return new AgentRunnerSetting(
      directory,
      env,
      injected ?? (await agentConfig(env, saved)),
      !injected,
      saved,
    );
  }

  state(): AgentRunnerSettingState {
    return {
      saved: this.saved ?? { runner: null },
      environment: !!this.env.GENOBI_AGENT_RUNNER?.trim(),
      hermesProvider: !!this.config.hermesProvider,
    };
  }

  /**
   * Builds the configuration again from the environment and the saved
   * choice, in place, so a harness installed or a profile set up since the
   * server started is found by the next status read or session start
   * without a restart. A configuration a test injected stays as given.
   */
  refresh(): Promise<void> {
    if (!this.live) return Promise.resolve();
    const run = this.queue.then(async () => {
      Object.assign(this.config, await agentConfig(this.env, this.saved));
    });
    this.queue = run.catch(() => {});
    return run;
  }

  /** Validates, writes the file (owner-only), then applies it. One at a time. */
  save(value: unknown): Promise<AgentRunnerSettingState> {
    const choice = parseAgentRunnerChoice(value);
    const run = this.queue.then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const file = path.join(this.directory, AGENT_RUNNER_FILE);
      await writeFile(`${file}.tmp`, `${JSON.stringify(choice)}\n`, {
        mode: 0o600,
      });
      await rename(`${file}.tmp`, file);
      this.saved = choice;
      if (this.live)
        Object.assign(this.config, await agentConfig(this.env, choice));
      return this.state();
    });
    this.queue = run.catch(() => {});
    return run;
  }
}
