// Starts one Hermes session for a project prompt, with the same limits as
// Claude Code (agent-runner.ts): only the Genobi MCP server and a browser
// MCP, only the tools listed there, the prompt on stdin, a scratch folder,
// no server keys. Hermes reads MCP servers and their tool filters only from
// its home's config.yaml, so the session runs in the `genobi` profile
// (agent-hermes-profile.ts), the same one `hermes -p genobi` opens.
//
// The command, from Hermes Agent's own help and docs (v0.21.4):
// - `HERMES_HOME=<root>/profiles/genobi` is what `hermes -p genobi` sets
//   (user-guide/profiles.md, "How it works").
// - `hermes chat --query-file -` reads the one query from stdin; `--oneshot`
//   answers it and exits; `--format stream-json` prints one JSON event per
//   line (reference/cli-commands.md, "--format stream-json").
// - `-t` enables only the named toolsets; each MCP server is a toolset
//   must use its raw configured server name (Hermes CLI v0.21.4), so no built-in tool
//   (terminal, files, web, skills, memory) is offered.
// - `--ignore-rules` skips AGENTS.md, SOUL.md and memory; `--source tool`
//   keeps the run out of the person's session lists.
// - `HERMES_EPHEMERAL_SYSTEM_PROMPT` is added to the system prompt at call
//   time and never saved (reference/environment-variables.md).
// - `-m` and `--provider` name the open model and its provider, both
//   required; the profile pins the same pair with fallback off.
import { randomBytes } from "node:crypto";
import { OPEN_ROUTE_REFUSAL, openRouteRefusal } from "../shared/open-route";
import type { AgentConfig } from "./agent-config";
import { RUN_TOKEN_VARIABLE } from "./agent-reap";
import { assertOpenProfile } from "./agent-hermes-pins";
import { assertOpenRoute } from "./agent-hermes-probe";
import {
  HERMES_BROWSER_SERVER,
  PROFILE_NAME,
  applyProfile,
  profileEnv,
  profileSettings,
  runHermes,
} from "./agent-hermes-profile";
import {
  baseEnv,
  sessionBrief,
  skillText,
  type LaunchPlan,
  type SessionPlanInput,
} from "./agent-runner";

/** The toolsets a session enables: the Genobi server's, and the browser's. */
export const hermesToolsets = (browser: boolean) => [
  PROFILE_NAME,
  ...(browser ? [HERMES_BROWSER_SERVER] : []),
];

/**
 * The environment Hermes gets: what it needs to run, its profile and the
 * brief. None of the server's keys, and none of the person's `HERMES_*`
 * settings (their home, shared sign-in folder or approvals mode). Hermes'
 * install folder gets no new bytecode either.
 */
export function hermesEnv(
  env: NodeJS.ProcessEnv,
  home: string,
  systemPrompt: string,
  token: string,
) {
  return {
    ...baseEnv(env),
    HERMES_HOME: home,
    HERMES_EPHEMERAL_SYSTEM_PROMPT: systemPrompt,
    [RUN_TOKEN_VARIABLE]: token,
    PYTHONDONTWRITEBYTECODE: "1",
  };
}

export interface HermesPlanOptions {
  /** Tests replace Hermes' own `config set` commands. */
  run?: Parameters<typeof applyProfile>[2];
}

/**
 * Brings the profile's Genobi keys up to date for this studio (only when they
 * changed) and checks every route it names is open, before Hermes runs in
 * it, headless here or in a Terminal window (agent-terminal.ts).
 */
export async function prepareHermesProfile(
  config: AgentConfig,
  studioOrigin: string,
  env: NodeJS.ProcessEnv = process.env,
  options: HermesPlanOptions = {},
) {
  const { hermesModel: model, hermesProvider: provider } = config;
  if (!config.hermes || !config.hermesHome || !model || !provider)
    throw new Error("Hermes is not configured.");
  // The open route: refused before the profile is touched or Hermes runs.
  if (config.hermesClosed || openRouteRefusal(model, provider))
    throw new Error(OPEN_ROUTE_REFUSAL);
  const run = options.run ?? runHermes(config.hermes);
  const settings = profileSettings(config, studioOrigin);
  await applyProfile(config.hermesHome, settings, run, env);
  // Whatever the pins did not reach must not name a closed route either,
  // and Hermes itself must resolve every route to an open endpoint.
  await assertOpenProfile(config.hermesHome);
  await assertOpenRoute(
    run.probe,
    profileEnv(config.hermesHome, env),
    settings,
  );
  return { hermes: config.hermes, home: config.hermesHome, model, provider };
}

/** Prepares the profile and returns the command that runs Hermes in it. */
export async function hermesPlan(
  config: AgentConfig,
  input: SessionPlanInput,
  env: NodeJS.ProcessEnv = process.env,
  options: HermesPlanOptions = {},
): Promise<LaunchPlan> {
  const { hermes, home, model, provider } = await prepareHermesProfile(
    config,
    input.studioOrigin,
    env,
    options,
  );
  const browser = config.browser && !!config.npx;
  const skill = await skillText(config.skill);
  // Marks every process this session starts, even one orphaned at once
  // (agent-reap.ts); the profile passes it on to the MCP servers.
  const token = randomBytes(12).toString("hex");
  return {
    command: hermes,
    args: [
      "chat",
      ...["--query-file", "-"],
      "--oneshot",
      ...["--format", "stream-json"],
      ...["-m", model],
      ...["--provider", provider],
      ...["-t", hermesToolsets(browser).join(",")],
      "--ignore-rules",
      ...["--source", "tool"],
      // The agent hears it is out of time at 80% of the session's ceiling.
      ...["--run-budget", String(Math.floor(config.timeoutMs / 1000))],
    ],
    cwd: input.workdir,
    env: hermesEnv(
      env,
      home,
      `${skill}\n\n${sessionBrief(input, browser)}`,
      token,
    ),
    stdin: input.prompt,
    tracksDescendants: true,
    runToken: token,
    grant: token,
  };
}
