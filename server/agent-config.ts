import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_RUNNERS,
  type AgentRunner,
  type AgentRunnerStatus,
} from "../shared/agent-session";
import { OPEN_ROUTE_REFUSAL, openRouteRefusal } from "../shared/open-route";
import {
  HERMES_MODEL as MODEL,
  HERMES_PROVIDER as PROVIDER,
  type AgentRunnerChoice,
} from "../shared/agent-runner-setting";
import {
  PROFILE_NAME,
  PROFILE_PROBLEMS,
  profileProblem,
} from "./agent-hermes-profile";

/**
 * Which agent the local server may start for a project prompt (issue #23),
 * read from the environment, or from the harness chosen in setup
 * (`.local/agent.json`, server/agent-runner-setting.ts) for whatever the
 * environment leaves unset. Nothing runs unless one of them names a runner:
 *
 * - GENOBI_AGENT_RUNNER: `claude` (Claude Code) or `hermes`; when set, it
 *   wins over the saved choice. `codex` is recorded but not supported yet.
 * - GENOBI_AGENT_CLAUDE: Claude Code's binary, when it is not on PATH.
 * - GENOBI_AGENT_HERMES: Hermes' binary, when it is not on PATH.
 * - GENOBI_AGENT_HERMES_ROOT: the Hermes root that holds the `genobi`
 *   profile (`<root>/profiles/genobi`), ~/.hermes by default. Sessions run
 *   in that profile, never the default one (see agent-hermes-profile.ts).
 * - GENOBI_AGENT_HERMES_MODEL: the model Hermes runs, required, open only.
 * - GENOBI_AGENT_HERMES_PROVIDER: its provider, required: Hermes never
 *   picks one, and never an Anthropic or OpenAI one (shared/open-route.ts).
 * - GENOBI_AGENT_NPX: npx for the browser MCP, when it is not on PATH.
 * - GENOBI_AGENT_BROWSER: `off` runs the session without a browser.
 * - GENOBI_AGENT_TIMEOUT_MINUTES: the ceiling on one session, 15 by default.
 *
 * Paths stay on the server: the status route answers booleans and names.
 */
export interface AgentConfig {
  /** The runner asked for; undefined when unset or unknown. */
  runner?: AgentRunner;
  /** GENOBI_AGENT_RUNNER was set to something that is not a runner. */
  unknownRunner: boolean;
  /** A harness was chosen that the studio cannot run sessions with yet. */
  unsupportedRunner?: "codex";
  claude?: string;
  hermes?: string;
  /** The `genobi` profile's home (`HERMES_HOME`); undefined without a root. */
  hermesHome?: string;
  /** Default-profile homes, which Genobi must never use as the profile. */
  hermesAvoid: string[];
  hermesModel?: string;
  hermesProvider?: string;
  /** GENOBI_AGENT_HERMES_MODEL or _PROVIDER is set but not a valid name. */
  hermesInvalid: boolean;
  /** The model or provider is Anthropic's or OpenAI's (or hides which). */
  hermesClosed: boolean;
  npx?: string;
  /** Node for the Genobi MCP server: the one running this server. */
  node: string;
  /** The plugin, its bundled Genobi MCP server and the skill that teaches it. */
  plugin: string;
  mcpServer: string;
  skill: string;
  browser: boolean;
  timeoutMs: number;
}

/** The pinned browser MCP (Apache-2.0), fetched by npx on first use. */
export const BROWSER_MCP = "@playwright/mcp@0.0.83";
const DEFAULT_MINUTES = 15;
const SETUP = "Install it, then choose Check again. See docs/agent-setup.md.";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** An absolute, executable file, or undefined. */
async function executable(file?: string) {
  if (!file || !path.isAbsolute(file)) return undefined;
  return access(file, constants.X_OK).then(
    () => file,
    () => undefined,
  );
}

/**
 * The binary itself, found on PATH as `command -v` would. No shell is
 * involved, so a shell function of the same name (an interactive `claude`
 * wrapper, say) is never what runs.
 */
export async function findBinary(
  name: string,
  env: NodeJS.ProcessEnv,
  extra: string[] = [],
) {
  const dirs = [...(env.PATH ?? "").split(path.delimiter), ...extra];
  for (const dir of dirs.filter((d) => path.isAbsolute(d))) {
    const found = await executable(path.join(dir, name));
    if (found) return found;
  }
  return undefined;
}

/**
 * The configuration from `env`, with the setup's saved choice filling what
 * the environment leaves unset: each variable, when set, wins.
 */
export async function agentConfig(
  env: NodeJS.ProcessEnv = process.env,
  saved?: AgentRunnerChoice,
): Promise<AgentConfig> {
  const value = (name: string) => env[name]?.trim() || undefined;
  const asked = value("GENOBI_AGENT_RUNNER") ?? saved?.runner ?? undefined;
  const runner = AGENT_RUNNERS.find((r) => r === asked);
  const minutes = Number(value("GENOBI_AGENT_TIMEOUT_MINUTES"));
  const home = env.HOME && path.join(env.HOME, ".local", "bin");
  const binary = async (name: string, variable: string) =>
    value(variable)
      ? await executable(value(variable))
      : await findBinary(name, env, home ? [home] : []);
  const model = value("GENOBI_AGENT_HERMES_MODEL") ?? saved?.hermesModel;
  const provider =
    value("GENOBI_AGENT_HERMES_PROVIDER") ?? saved?.hermesProvider;
  const hermesRoot =
    value("GENOBI_AGENT_HERMES_ROOT") ??
    (env.HOME && path.join(env.HOME, ".hermes"));
  return {
    runner,
    unknownRunner: !!asked && !runner && asked !== "codex",
    unsupportedRunner: asked === "codex" ? "codex" : undefined,
    claude:
      runner === "claude"
        ? await binary("claude", "GENOBI_AGENT_CLAUDE")
        : undefined,
    hermes:
      runner === "hermes"
        ? await binary("hermes", "GENOBI_AGENT_HERMES")
        : undefined,
    hermesHome:
      hermesRoot && path.isAbsolute(hermesRoot)
        ? path.resolve(hermesRoot, "profiles", PROFILE_NAME)
        : undefined,
    hermesAvoid: [
      env.HOME && path.join(env.HOME, ".hermes"),
      value("HERMES_HOME"),
    ].filter((home): home is string => !!home && path.isAbsolute(home)),
    hermesModel: model && MODEL.test(model) ? model : undefined,
    // Lower-cased as Hermes keys it (`Nous` is `nous`); aliases stay as
    // written, since Hermes treats an alias and its provider alike.
    hermesProvider:
      provider && PROVIDER.test(provider) ? provider.toLowerCase() : undefined,
    hermesInvalid:
      (!!model && !MODEL.test(model)) ||
      (!!provider && !PROVIDER.test(provider)),
    hermesClosed: !!openRouteRefusal(model ?? "", provider ?? ""),
    npx: value("GENOBI_AGENT_NPX")
      ? await executable(value("GENOBI_AGENT_NPX"))
      : await findBinary("npx", env),
    node: process.execPath,
    plugin: path.join(root, "plugins/genobi"),
    mcpServer: path.join(root, "plugins/genobi/server/genobi-mcp.mjs"),
    skill: path.join(root, "plugins/genobi/skills/genobi-studio/SKILL.md"),
    browser: value("GENOBI_AGENT_BROWSER") !== "off",
    timeoutMs:
      Number.isInteger(minutes) && minutes >= 1 && minutes <= 120
        ? minutes * 60_000
        : DEFAULT_MINUTES * 60_000,
  };
}

/**
 * What `GET /api/agent/status` answers: whether a session can start, the
 * runner's name, and a fixed sentence. Never a path or a variable's value.
 */
export async function runnerStatus(
  config: AgentConfig,
): Promise<AgentRunnerStatus> {
  if (config.unknownRunner)
    return {
      available: false,
      message: `GENOBI_AGENT_RUNNER names no runner Genobi knows. ${SETUP}`,
    };
  if (config.unsupportedRunner)
    return {
      available: false,
      message:
        "Codex is chosen, but the runner is not supported yet: the studio cannot start Codex sessions. Choose Claude Code or Hermes in setup for project prompts, or use Codex with the Genobi plugin in your own terminal.",
    };
  if (!config.runner)
    return {
      available: false,
      message:
        "No agent is set up on this server. Choose one in setup's Connect step.",
    };
  const runner = config.runner;
  const off = (message: string): AgentRunnerStatus => ({
    available: false,
    runner,
    message,
  });
  if (runner === "claude" && !config.claude)
    return off(`Claude Code was not found on this machine. ${SETUP}`);
  if (runner === "hermes") {
    const problem = await hermesProblem(config);
    if (problem === PROFILE_PROBLEMS.missing)
      return { ...off(problem), setup: "hermes-profile" };
    if (problem) return off(problem);
  }
  if (!(await executable(config.node)) || !(await readable(config.mcpServer)))
    return off("The Genobi MCP server is not built. Run `npm run build:mcp`.");
  if (config.browser && !config.npx)
    return {
      available: true,
      runner,
      message: "npx was not found, so the agent works without a browser.",
    };
  return { available: true, runner };
}

/** Why a Hermes session cannot start yet, as a fixed sentence, or nothing. */
async function hermesProblem(config: AgentConfig) {
  if (!config.hermes) return `Hermes was not found on this machine. ${SETUP}`;
  if (config.hermesInvalid)
    return `Hermes' model or provider (GENOBI_AGENT_HERMES_MODEL or GENOBI_AGENT_HERMES_PROVIDER, or the one saved in setup) is not a valid name. ${SETUP}`;
  // Checked again from the values themselves, whatever built the config.
  if (
    config.hermesClosed ||
    openRouteRefusal(config.hermesModel ?? "", config.hermesProvider ?? "")
  )
    return `${OPEN_ROUTE_REFUSAL} ${SETUP}`;
  if (!config.hermesModel)
    return `Choose the open model Hermes should run in setup's Connect step (DeepSeek V4.1 Flash on Nous is the default), or set GENOBI_AGENT_HERMES_MODEL.`;
  if (!config.hermesProvider)
    return `Choose the provider the genobi profile signs in with in setup's Connect step (such as nous), or set GENOBI_AGENT_HERMES_PROVIDER; Hermes does not pick one.`;
  const problem = await profileProblem(config);
  return problem && PROFILE_PROBLEMS[problem];
}

const readable = (file: string) =>
  access(file, constants.R_OK).then(
    () => true,
    () => false,
  );
