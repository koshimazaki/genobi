// The local server with agent sessions on, run by a fake Claude Code
// (tests/fixtures/agent/fake-claude.mjs) or a fake Hermes (fake-hermes.mjs)
// that prints stream-JSON. No real agent, browser or provider is started.
import {
  copyFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, expect } from "vitest";
import type { AgentConfig } from "../server/agent-config";
import {
  applyProfile,
  createProfile,
  profileSettings,
  type HermesRun,
} from "../server/agent-hermes-profile";
import { createApp, type AppOptions } from "../server/app";
import type { AgentSession } from "../shared/agent-session";
import { FakeBfl } from "./server-harness";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

export const STUDIO_HEADERS = {
  "X-Genobi-Agent": "1",
  "Content-Type": "application/json",
};

/** A temporary folder with an executable copy of the fake runner. */
export async function fakeMachine() {
  const root = await mkdtemp(path.join(os.tmpdir(), "genobi-agent-test-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const claude = path.join(root, "claude");
  await copyFile(path.resolve("tests/fixtures/agent/fake-claude.mjs"), claude);
  await chmod(claude, 0o755);
  return { root, claude };
}

export async function fakeConfig(
  overrides: Partial<AgentConfig> = {},
): Promise<AgentConfig> {
  const { claude } = await fakeMachine();
  return {
    runner: "claude",
    unknownRunner: false,
    claude,
    node: process.execPath,
    // Any readable file stands in for the MCP bundle; the fake never runs it.
    mcpServer: claude,
    plugin: path.resolve("plugins/genobi"),
    skill: path.resolve("plugins/genobi/skills/genobi-studio/SKILL.md"),
    browser: false,
    timeoutMs: 60_000,
    hermesAvoid: [],
    hermesInvalid: false,
    hermesClosed: false,
    ...overrides,
  };
}

/**
 * A fake Hermes and its `genobi` profile under a temporary Hermes root, set
 * up the way `npm run agent:hermes-profile` does (for another studio port,
 * so a session's start brings it up to date).
 */
export async function fakeHermesConfig(
  overrides: Partial<AgentConfig> = {},
): Promise<AgentConfig> {
  const { root } = await fakeMachine();
  const hermes = path.join(root, "hermes");
  await copyFile(path.resolve("tests/fixtures/agent/fake-hermes.mjs"), hermes);
  await chmod(hermes, 0o755);
  const hermesRoot = path.join(root, "hermes-root");
  const hermesHome = path.join(hermesRoot, "profiles", "genobi");
  const config = await fakeConfig({
    runner: "hermes",
    claude: undefined,
    hermes,
    hermesHome,
    hermesAvoid: [hermesRoot],
    hermesModel: "deepseek/deepseek-v4-pro",
    hermesProvider: "nous",
    ...overrides,
  });
  // The fake binary's profile commands, in-process: tests stay fast under
  // load, and a session's own update still runs the binary.
  const run: HermesRun = async (args, env) => {
    if (args[0] === "profile")
      return void (await mkdir(
        path.join(env.HERMES_HOME, "profiles", args[2]),
        {
          recursive: true,
        },
      ));
    const file = path.join(env.HERMES_HOME, "fake-config.json");
    const config = JSON.parse(await readFile(file, "utf8").catch(() => "{}"));
    if (args[0] === "plugins") config.plugins = [args[2]];
    else
      config[args[2]] = /^[[{]/.test(args[3]) ? JSON.parse(args[3]) : args[3];
    await writeFile(file, JSON.stringify(config));
  };
  await createProfile(hermesRoot, run, process.env);
  await applyProfile(
    hermesHome,
    profileSettings(config, "http://127.0.0.1:1"),
    run,
    process.env,
  );
  return config;
}

export async function agentStudio(
  options: {
    config?: AgentConfig;
    kill?: (pid: number, signal: NodeJS.Signals) => void;
    graceMs?: number;
    sampleMs?: number;
    /**
     * How long a live session waits for a message after a reply: short by
     * default, so a one-turn session settles at once.
     */
    idleMs?: number;
    /** Other server options: keys, workflow clients, run location. */
    app?: Partial<AppOptions>;
  } = {},
) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "genobi-agent-app-"));
  cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, ".local");
  const bfl = new FakeBfl();
  // Listening first, so the sessions' Genobi MCP config names this studio.
  const server = createServer();
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const base = `http://127.0.0.1:${address.port}`;
  const created = await createApp({
    directory,
    publicDirectory: directory,
    serverKey: "test-server-key",
    providers: { bfl },
    ...options.app,
    agent: {
      config: options.config ?? (await fakeConfig()),
      studioOrigin: base,
      ...(options.kill ? { kill: options.kill } : {}),
      ...(options.graceMs ? { graceMs: options.graceMs } : {}),
      ...(options.sampleMs ? { sampleMs: options.sampleMs } : {}),
      idleMs: options.idleMs ?? 50,
    },
  });
  server.on("request", created.app);
  cleanups.push(async () => {
    await created.agents.close();
    // Idle keep-alive sockets would hold close() open for their timeout.
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const fresh = async () =>
    (await fetch(`${base}/api/health`)).headers
      .get("set-cookie")!
      .split(";")[0];
  const call = async (
    cookie: string,
    route: string,
    init: { method?: string; body?: unknown; headers?: object } = {},
  ) => {
    const response = await fetch(`${base}/api/agent${route}`, {
      method: init.method ?? "GET",
      headers: { cookie, ...STUDIO_HEADERS, ...init.headers },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const start = (cookie: string, prompt: string, extra: object = {}) =>
    call(cookie, "/sessions", {
      method: "POST",
      body: { prompt, source: "typed", ...extra },
    });
  /**
   * Polls until the session leaves `starting` and `running`: about five
   * seconds, or `tries` × 50 ms for a session that does real work.
   */
  const settle = async (cookie: string, id: string, tries = 100) => {
    for (let i = 0; i < tries; i++) {
      const { body } = await call(cookie, `/sessions/${id}`);
      if (!["starting", "running"].includes(body.status))
        return body as AgentSession;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("The session did not finish.");
  };
  /** Polls until a line matching `pattern` appears; returns its match. */
  const waitFor = async (cookie: string, id: string, pattern: RegExp) => {
    for (let i = 0; i < 100; i++) {
      const { body } = await call(cookie, `/sessions/${id}`);
      const match = (body.lines as string[])
        .map((line) => line.match(pattern))
        .find(Boolean);
      if (match) return match;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`No line matched ${pattern}`);
  };
  expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  return { ...created, bfl, base, fresh, call, start, settle, waitFor };
}

export const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
