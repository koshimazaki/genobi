// The `genobi` Hermes profile, shared by the studio's runner and by a person
// typing `hermes -p genobi` in a terminal. A Hermes profile is its own home
// (`<root>/profiles/<name>`, `HERMES_HOME`) with its own config.yaml, .env,
// skills, plugins, memory and sessions (Hermes docs: user-guide/profiles.md,
// "How it works"; `hermes profile --help`, `hermes -p <name>`). Genobi
// creates it with Hermes' own `hermes profile create` and sets only its own
// keys with `hermes -p genobi config set` and `plugins enable`, so the default
// profile (~/.hermes itself) and every other profile stay as they are.
// Genobi never reads, copies or writes a credential; the person signs the
// profile in with Hermes' own `auth add`.
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readFile,
  readlink,
  rename,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import type { AgentConfig } from "./agent-config";
import { BROWSER_MCP } from "./agent-config";
import {
  BROWSER_TOOLS,
  GENOBI_TOOLS,
  baseEnv,
  genobiServerEnv,
} from "./agent-runner";
import { AGENT_MARK_HEADER } from "../shared/agent-session-events";
import { OPEN_ROUTE_REFUSAL, openRouteRefusal } from "../shared/open-route";
import { RUN_TOKEN_VARIABLE } from "./agent-reap";
import { pinnedRoutes } from "./agent-hermes-pins";
import { probeRoute, type RouteProbe } from "./agent-hermes-probe";

export const PROFILE_NAME = "genobi";
/** Genobi's record of what it last set in the profile; nothing else. */
export const PROFILE_MARKER = "genobi-profile.json";
/** The browser MCP server; not `browser`, a built-in toolset's name. */
export const HERMES_BROWSER_SERVER = "studio_browser";
/**
 * The name Hermes gives the plugin's own MCP server: the plugin's namespace
 * (`agent-plugin-<slug>-<first 8 hex of sha256(key)>`, developer-guide/
 * plugins/index.md) and the server's name. A config.yaml server of the same
 * name replaces it, so the profile switches it off and runs its own `genobi`
 * server with the tool filter instead; the plugin still brings its skills.
 */
export const PLUGIN_SERVER = `agent-plugin-genobi-${createHash("sha256")
  .update(PROFILE_NAME)
  .digest("hex")
  .slice(0, 8)}__genobi`;

/** Raised when the keys Genobi sets change, so existing profiles update. */
const PROFILE_SCHEMA = 4;

/** The hash of an empty or missing config.yaml. */
const NO_CONFIG = createHash("sha256").update("").digest("hex");

/**
 * The marker's text: what Genobi sets in the profile, including both tool
 * allowlists the profile's servers carry, so adding or removing a tool in
 * `GENOBI_TOOLS` or `BROWSER_TOOLS` re-applies an existing profile without a
 * hand-raised schema, and the hash of config.yaml as Genobi left it, so a
 * later edit re-applies the pins.
 */
export function profileMarker(
  settings: ProfileSettings,
  tools = { genobi: GENOBI_TOOLS, browser: BROWSER_TOOLS },
  config = NO_CONFIG,
) {
  return `${JSON.stringify({ owner: "genobi", schema: PROFILE_SCHEMA, tools, settings, config }, null, 2)}\n`;
}

export type ProfileProblem = "default" | "missing";

/** Fixed sentences for the status route: names and commands, never a path. */
export const PROFILE_PROBLEMS: Record<ProfileProblem, string> = {
  default:
    "GENOBI_AGENT_HERMES_ROOT must be a Hermes root; Genobi uses its `genobi` profile, never the default profile. See docs/agent-setup.md.",
  missing:
    "Hermes' `genobi` profile is not set up yet. Choose Set up Hermes: Genobi sets it up for the model and provider chosen in setup.",
};

const exists = (file: string) =>
  access(file, constants.F_OK).then(
    () => true,
    () => false,
  );

/** Why the profile cannot run a session, or undefined when it can. */
export async function profileProblem(
  config: Pick<AgentConfig, "hermesHome" | "hermesAvoid">,
): Promise<ProfileProblem | undefined> {
  const home = config.hermesHome;
  if (!home) return "default";
  if (config.hermesAvoid.some((root) => path.resolve(root) === home))
    return "default";
  return (await exists(path.join(home, PROFILE_MARKER)))
    ? undefined
    : "missing";
}

/** What Genobi sets in the profile; a change to any of it is applied again. */
export interface ProfileSettings {
  studioOrigin: string;
  node: string;
  mcpServer: string;
  plugin: string;
  npx?: string;
  /** The open model and its provider, both pinned (shared/open-route.ts). */
  model: string;
  provider: string;
}

/**
 * The settings for this studio. Throws, before anything is written or run,
 * without a model and provider or when either is Anthropic's or OpenAI's.
 */
export function profileSettings(
  config: AgentConfig,
  studioOrigin: string,
): ProfileSettings {
  const { hermesModel: model, hermesProvider: provider } = config;
  if (!model || !provider)
    throw new Error("Hermes needs its model and provider set.");
  if (config.hermesClosed || openRouteRefusal(model, provider))
    throw new Error(OPEN_ROUTE_REFUSAL);
  return {
    studioOrigin,
    node: config.node,
    mcpServer: config.mcpServer,
    plugin: config.plugin,
    ...(config.browser && config.npx ? { npx: config.npx } : {}),
    model,
    provider,
  };
}

/** The browser's config and output live in the profile, for both ways in. */
const browserDir = (home: string) => path.join(home, "genobi-browser");

/** The `hermes` commands that set Genobi's keys, in order. */
export function profileCommands(home: string, settings: ProfileSettings) {
  // A top-level key may hold a mapping Hermes refuses to replace without
  // `--force` (config.py, `_guard_section_overwrite`).
  const set = (key: string, value: unknown) => [
    "config",
    "set",
    key,
    typeof value === "string" ? value : JSON.stringify(value),
    ...(key.includes(".") ? [] : ["--force"]),
  ];
  const noExtras = { prompts: false, resources: false };
  // Hermes passes an MCP server only the env it lists, filled in from the
  // runner's own environment when it starts the server
  // (reference/mcp-config-reference.md, "Environment variable references"),
  // so the session's token reaches the servers and their children.
  const token = { [RUN_TOKEN_VARIABLE]: `\${${RUN_TOKEN_VARIABLE}}` };
  const commands = [
    ["plugins", "enable", PROFILE_NAME],
    set(`mcp_servers.${PROFILE_NAME}`, {
      command: settings.node,
      args: [settings.mcpServer],
      env: { ...genobiServerEnv(settings.studioOrigin), ...token },
      tools: { include: GENOBI_TOOLS, ...noExtras },
    }),
    set(`mcp_servers.${PLUGIN_SERVER}`, { enabled: false }),
    // Tool Search would put the tools behind a `tool_call` bridge
    // (user-guide/features/tool-search.md); keep them as themselves.
    set("tools.tool_search.enabled", "off"),
  ];
  if (settings.npx)
    commands.push(
      set(`mcp_servers.${HERMES_BROWSER_SERVER}`, {
        command: settings.npx,
        args: [
          "-y",
          BROWSER_MCP,
          "--isolated",
          "--headless",
          "--allowed-origins",
          settings.studioOrigin,
          "--block-service-workers",
          "--no-webmcp",
          "--config",
          path.join(browserDir(home), "browser.json"),
          "--output-dir",
          path.join(browserDir(home), "output"),
        ],
        env: token,
        tools: { include: BROWSER_TOOLS, ...noExtras },
      }),
    );
  else
    commands.push(
      set(`mcp_servers.${HERMES_BROWSER_SERVER}`, { enabled: false }),
    );
  // The open model and provider on every route Hermes has, no fallback
  // anywhere (agent-hermes-pins.ts). Hermes runs its primary on every turn
  // (cli_agent_setup_mixin.py, `_resolve_turn_agent_config`); credential
  // pools rotate keys of the same provider only (credential-pools.md).
  for (const [key, value] of pinnedRoutes(settings))
    commands.push(set(key, value));
  return commands;
}

/** Runs `hermes <args>` for the profile; rejects on a failure. */
export type HermesRun = ((
  args: string[],
  env: Record<string, string>,
) => Promise<void>) & {
  /** Asks Hermes' resolver where the route goes; absent in tests. */
  probe?: RouteProbe;
};

export const runHermes = (binary: string): HermesRun =>
  Object.assign(
    (args: string[], env: Record<string, string>) =>
      new Promise<void>((resolve, reject) =>
        execFile(
          binary,
          args,
          { env, timeout: 60_000, windowsHide: true },
          (error) =>
            error
              ? reject(
                  new Error(`hermes ${args.slice(0, 2).join(" ")} failed.`),
                )
              : resolve(),
        ),
      ),
    { probe: probeRoute(binary) },
  );

/** The environment for Hermes' own commands: the profile, nothing else. */
export const profileEnv = (home: string, env: NodeJS.ProcessEnv) => ({
  ...baseEnv(env),
  HERMES_HOME: home,
  PYTHONDONTWRITEBYTECODE: "1",
});

/**
 * Creates the profile with Hermes' own command when it does not exist: no
 * wrapper script in ~/.local/bin, no bundled skills. Under `root` only.
 */
export async function createProfile(
  root: string,
  run: HermesRun,
  env: NodeJS.ProcessEnv,
) {
  const home = path.join(root, "profiles", PROFILE_NAME);
  if (await exists(home)) return false;
  await run(["profile", "create", PROFILE_NAME, "--no-alias", "--no-skills"], {
    ...baseEnv(env),
    HERMES_HOME: root,
    PYTHONDONTWRITEBYTECODE: "1",
  });
  return true;
}

/** Points the profile's `plugins/genobi` at this checkout's plugin. */
async function linkPlugin(home: string, plugin: string) {
  const link = path.join(home, "plugins", PROFILE_NAME);
  await mkdir(path.dirname(link), { recursive: true });
  const current = await lstat(link).catch(() => undefined);
  if (current && !current.isSymbolicLink())
    throw new Error(
      "The profile's plugins/genobi is a folder, not Genobi's link; move it and run the setup again.",
    );
  if (current && (await readlink(link)) === plugin) return;
  if (current) await unlink(link);
  await symlink(plugin, link);
}

/**
 * The profile's config.yaml as Genobi last left it. A change since (a
 * `hermes -p genobi fallback add`, a persisted model switch) makes the next
 * session set Genobi's keys again, so the pins hold.
 */
async function configHash(home: string) {
  const hash = async (file: string) => {
    const text = await readFile(path.join(home, file)).catch(() => undefined);
    return text && createHash("sha256").update(text).digest("hex");
  };
  // The profile's .env too: an endpoint override there changes the route.
  const [config, env] = await Promise.all([hash("config.yaml"), hash(".env")]);
  return env ? `${config ?? NO_CONFIG}:${env}` : (config ?? NO_CONFIG);
}

/** One profile update at a time in this process. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Sets Genobi's keys in the profile when they differ from what it last set,
 * or when config.yaml changed since: the plugin link, the plugin enabled, the
 * filtered servers, the browser's marked config, the pinned model and no
 * fallback. Writes nothing outside the profile's own folder.
 */
export function applyProfile(
  home: string,
  settings: ProfileSettings,
  run: HermesRun,
  env: NodeJS.ProcessEnv = process.env,
  force = false,
): Promise<boolean> {
  const step = queue.then(async () => {
    const marker = path.join(home, PROFILE_MARKER);
    if (
      !force &&
      (await readFile(marker, "utf8").catch(() => "")) ===
        profileMarker(settings, undefined, await configHash(home))
    )
      return false;
    await linkPlugin(home, settings.plugin);
    if (settings.npx) {
      await mkdir(path.join(browserDir(home), "output"), { recursive: true });
      await writeFile(
        path.join(browserDir(home), "browser.json"),
        JSON.stringify({
          browser: {
            contextOptions: { extraHTTPHeaders: { [AGENT_MARK_HEADER]: "1" } },
          },
        }),
      );
    }
    for (const args of profileCommands(home, settings))
      await run(args, profileEnv(home, env));
    const temporary = `${marker}.${randomBytes(6).toString("hex")}`;
    await writeFile(
      temporary,
      profileMarker(settings, undefined, await configHash(home)),
      { mode: 0o600 },
    );
    await rename(temporary, marker);
    return true;
  });
  queue = step.catch(() => {});
  return step;
}
