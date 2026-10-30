// A Genobi agent session in a Terminal window (docs/agent-setup.md, "Spawn
// the agent"): the person watches the harness work and can type into it,
// while the studio follows the session's quotes through its grant, as it
// follows a headless one. The window opens the way the supervisor's
// Developer session does (`DevelopmentTerminal.openAgent`): a private plan
// and `.command` file, the argument list passed without a shell.
//
// No key or grant is ever on a command line or in the brief. The grant
// reaches the Genobi MCP server through an owner-only file: Claude Code's
// MCP config, or the plan's environment for Hermes, whose `genobi` profile
// passes `GENOBI_AGENT_RUN` on to the server (agent-hermes-profile.ts).
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { HERMES_PROVIDER } from "../shared/agent-runner-setting";
import type { AgentRunner } from "../shared/agent-session";
import { openRouteRefusal } from "../shared/open-route";
import type { AgentConfig } from "./agent-config";
import {
  hermesToolsets,
  prepareHermesProfile,
  type HermesPlanOptions,
} from "./agent-hermes";
import { PROFILE_NAME } from "./agent-hermes-profile";
import { RUN_TOKEN_VARIABLE } from "./agent-reap";
import {
  genobiServerEnv,
  sessionBrief,
  skillText,
  type SessionPlanInput,
} from "./agent-runner";
import type { DevelopmentTerminal } from "./development-terminal";
import { loginArguments } from "./development-terminal-plan";
import { AppError } from "./errors";
import { HERMES_SIGNED_IN } from "./harness-sign-in";

/** What the agent sessions need of the native launcher. */
export type AgentTerminal = Pick<
  DevelopmentTerminal,
  "supported" | "agentFolder" | "openAgent"
>;

export const TERMINAL_BRIEF = [
  "## In a Terminal window",
  "",
  "This session runs in a Terminal window the person can see and type into. Answer their first message, then wait for their next one rather than ending the session. Your quotes and project changes also appear in their studio. When they say in this window that they sent a message from the studio, call `genobi_status` to collect it.",
].join("\n");

/** The brief a Terminal session appends: no browser, and the window's rules. */
export const terminalBrief = (input: SessionPlanInput) =>
  `${sessionBrief(input, false)}\n\n${TERMINAL_BRIEF}`;

export interface TerminalPlan {
  command: string;
  args: string[];
  env: Record<string, string>;
  /** Owner-only files written beside the plan, by name. */
  files: Record<string, string>;
  /** The token the session's Genobi MCP server sends as `X-Genobi-Agent-Run`. */
  grant: string;
  /**
   * Run in the window before the harness: its own sign-in, skipped when its
   * read-only `check` already lists one (`signedIn`, a pattern's source).
   * See scripts/development-terminal.mjs.
   */
  signIn?: { args: string[]; check: string[]; signedIn: string };
}

/**
 * Hermes' sign-in for the session's provider, run in the session's own
 * window (`hermes -p genobi auth add <provider>`, `--type oauth` for Nous, as
 * setup's Sign in opens it), with `auth list <provider>` as its check. The
 * provider is a checked name, one argument; no shell reads it.
 */
export function hermesSignIn(provider: string): TerminalPlan["signIn"] {
  if (!HERMES_PROVIDER.test(provider) || openRouteRefusal("", provider))
    throw new AppError(
      409,
      "Choose Hermes' open model provider in setup first.",
      "hermes_provider_missing",
    );
  return {
    args: loginArguments("hermes", provider).args,
    check: ["-p", PROFILE_NAME, "auth", "list", provider],
    signedIn: HERMES_SIGNED_IN.source,
  };
}

const newGrant = () => randomBytes(12).toString("hex");

/**
 * `claude` in the checkout, interactive: only the session's own Genobi MCP
 * server (its config file holds the grant), `genobi_submit` refused, the
 * skill and brief appended to the system prompt, a fresh session id, and
 * the person's words as the first turn. `--session-id` takes one value, so
 * the prompt after it is never read as another option's value.
 */
export async function claudeTerminalPlan(
  config: AgentConfig,
  input: SessionPlanInput,
  folder: string,
): Promise<TerminalPlan> {
  if (!config.claude) throw new Error("Claude Code is not configured.");
  const grant = newGrant();
  const mcp = {
    mcpServers: {
      genobi: {
        type: "stdio",
        command: config.node,
        args: [config.mcpServer],
        env: {
          ...genobiServerEnv(input.studioOrigin),
          [RUN_TOKEN_VARIABLE]: grant,
        },
      },
    },
  };
  const skill = await skillText(config.skill);
  // A leading dash would read as an option.
  const first = input.prompt.replace(/^[\s-]+/, "");
  return {
    command: config.claude,
    args: [
      ...["--disallowedTools", "mcp__genobi__genobi_submit"],
      "--strict-mcp-config",
      ...["--mcp-config", path.join(folder, "mcp.json")],
      ...["--append-system-prompt", `${skill}\n\n${terminalBrief(input)}`],
      ...["--session-id", randomUUID()],
      ...(first ? [first] : []),
    ],
    env: {},
    files: { "mcp.json": JSON.stringify(mcp) },
    grant,
  };
}

/**
 * `hermes -p genobi chat --no-restore-cwd`, interactive, in the profile the
 * headless sessions use (brought up to date and checked open first): its
 * pinned open model and provider, only the Genobi toolset, no repository
 * rules, the brief in `HERMES_EPHEMERAL_SYSTEM_PROMPT`, and the person's
 * words from a file as the first turn (on a real TTY `--query-file` seeds
 * the chat rather than answering and exiting).
 */
export async function hermesTerminalPlan(
  config: AgentConfig,
  input: SessionPlanInput,
  folder: string,
  options: HermesPlanOptions = {},
): Promise<TerminalPlan> {
  const { hermes, model, provider } = await prepareHermesProfile(
    config,
    input.studioOrigin,
    process.env,
    options,
  );
  const grant = newGrant();
  const skill = await skillText(config.skill);
  return {
    command: hermes,
    args: [
      ...["-p", PROFILE_NAME, "chat", "--no-restore-cwd"],
      ...["-m", model, "--provider", provider],
      ...["-t", hermesToolsets(false).join(",")],
      "--ignore-rules",
      ...["--query-file", path.join(folder, "prompt.txt")],
    ],
    env: {
      HERMES_EPHEMERAL_SYSTEM_PROMPT: `${skill}\n\n${terminalBrief(input)}`,
      [RUN_TOKEN_VARIABLE]: grant,
      PYTHONDONTWRITEBYTECODE: "1",
    },
    files: { "prompt.txt": input.prompt },
    grant,
    // The studio saw Hermes signed out: this window signs in first.
    ...(input.signIn ? { signIn: hermesSignIn(provider) } : {}),
  };
}

/**
 * The window's plan. Only Hermes signs in inside it (`input.signIn`); Claude
 * Code keeps its own login, which it asks for in the window when needed.
 */
export const terminalPlan = (
  runner: AgentRunner,
  config: AgentConfig,
  input: SessionPlanInput,
  folder: string,
) =>
  runner === "claude"
    ? claudeTerminalPlan(config, input, folder)
    : hermesTerminalPlan(config, input, folder);

/**
 * Reads the launcher's receipt (`status.json`, written when the harness
 * exits) every `everyMs` until it says closed or failed. Returns a stop.
 * `onSignedIn` hears once that the window's own sign-in finished.
 */
export function watchTerminal(
  statusFile: string,
  onEnd: (status: "closed" | "failed") => void,
  everyMs = 2000,
  onSignedIn?: () => void,
) {
  let done = false;
  let signedIn = false;
  const stop = () => {
    done = true;
    clearInterval(timer);
  };
  const timer = setInterval(() => {
    void readFile(statusFile, "utf8").then(
      (text) => {
        let status: unknown;
        try {
          status = (JSON.parse(text) as { status?: unknown }).status;
        } catch {
          return;
        }
        if (!done && !signedIn && status === "signed-in") {
          signedIn = true;
          onSignedIn?.();
        }
        if (done || (status !== "closed" && status !== "failed")) return;
        stop();
        onEnd(status);
      },
      () => {},
    );
  }, everyMs);
  timer.unref();
  return stop;
}
