// Setup's "Set up Hermes" (`POST /api/agent/hermes-profile`): the profile
// setup the script runs, from the saved choice, against a fake `hermes` on
// PATH. Progress is polled, refusals answer at once, an agent's session is
// refused, and the runner sees the new profile without a restart.
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runnerStatus } from "../server/agent-config";
import { PROFILE_MARKER, type HermesRun } from "../server/agent-hermes-profile";
import { HermesProfileSetup } from "../server/agent-hermes-profile-setup";
import { AgentRunnerSetting } from "../server/agent-runner-setting";
import { jsonErrors } from "../server/error-handler";
import { setupRouter } from "../server/setup-routes";
import { readSignIn } from "../src/setup/connect-api";
import { DEFAULT_HERMES_CHOICE } from "../shared/agent-runner-setting";
import { OPEN_ROUTE_REFUSAL } from "../shared/open-route";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A machine with a fake `hermes` on PATH (optional) and a fresh Hermes root. */
async function machine({ hermes = true, env = {} } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "genobi-hermes-setup-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  await mkdir(bin);
  if (hermes) {
    await copyFile(
      path.resolve("tests/fixtures/agent/fake-hermes.mjs"),
      path.join(bin, "hermes"),
    );
    await chmod(path.join(bin, "hermes"), 0o755);
  }
  const environment: NodeJS.ProcessEnv = {
    PATH: [bin, path.dirname(process.execPath), "/usr/bin", "/bin"].join(":"),
    HOME: path.join(root, "home"),
    GENOBI_AGENT_HERMES_ROOT: path.join(root, "hermes-root"),
    ...env,
  };
  const directory = path.join(root, "local");
  const setting = await AgentRunnerSetting.load(
    directory,
    undefined,
    environment,
  );
  await setting.save({
    runner: "hermes",
    hermesModel: DEFAULT_HERMES_CHOICE.model,
    hermesProvider: DEFAULT_HERMES_CHOICE.provider,
  });
  const home = path.join(root, "hermes-root", "profiles", "genobi");
  return { root, bin, environment, setting, home };
}

/** The setup routes on a loopback port, as the studio or an agent. */
async function serve(
  setting: AgentRunnerSetting,
  profile: HermesProfileSetup,
  signIn?: Parameters<typeof setupRouter>[3] extends infer O
    ? O extends { signIn?: infer S }
      ? S
      : never
    : never,
) {
  const app = express();
  const who = { agent: false };
  app.use((_request, response, next) => {
    response.locals.sessionId = "person";
    response.locals.agent = who.agent;
    next();
  });
  app.use(
    "/api",
    setupRouter(setting, () => {}, undefined, { profile, signIn }),
  );
  app.use(jsonErrors);
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  const base = `http://127.0.0.1:${address.port}/api`;
  const studio = { "X-Genobi-Agent": "1" };
  const call = (route: string, method = "GET") =>
    fetch(`${base}${route}`, { method, headers: studio });
  return { base, who, call };
}

async function finished(call: (route: string) => Promise<Response>) {
  let state = await (await call("/agent/hermes-profile")).json();
  await vi.waitFor(
    async () => {
      state = await (await call("/agent/hermes-profile")).json();
      expect(state.phase).not.toBe("running");
    },
    { timeout: 20_000, interval: 100 },
  );
  return state;
}

describe("Set up Hermes from the studio", { timeout: 30_000 }, () => {
  it("runs the profile setup for the saved choice, and the runner sees it at once", async () => {
    const m = await machine();
    expect(await runnerStatus(m.setting.config)).toMatchObject({
      available: false,
      setup: "hermes-profile",
    });
    const profile = new HermesProfileSetup(
      m.setting,
      "http://127.0.0.1:4431",
      m.environment,
    );
    const { call } = await serve(m.setting, profile);
    expect(await (await call("/agent/hermes-profile")).json()).toEqual({
      phase: "idle",
      steps: {},
    });
    const started = await call("/agent/hermes-profile", "POST");
    expect(started.status).toBe(202);
    expect(await started.json()).toMatchObject({ phase: "running" });
    const state = await finished(call);
    expect(state).toEqual({
      phase: "done",
      created: true,
      steps: { check: "done", create: "done", apply: "done", verify: "done" },
    });
    // The fake Hermes recorded the pinned pair in the profile alone.
    const written = JSON.parse(
      await readFile(path.join(m.home, "fake-config.json"), "utf8"),
    );
    expect(written).toMatchObject({
      "model.default": "deepseek/deepseek-v4.1-flash",
      "model.provider": "nous",
      fallback_providers: [],
    });
    expect(existsSync(path.join(m.home, PROFILE_MARKER))).toBe(true);
    // No restart: the same configuration object now reads as set up.
    const status = await runnerStatus(m.setting.config);
    expect(status.setup).toBeUndefined();
    expect(status.message ?? "").not.toMatch(/not set up yet/);
    expect(JSON.stringify(state)).not.toContain(m.root);
  });

  it("refuses before anything runs, with the reason, and never for an agent", async () => {
    const missing = await machine({ hermes: false });
    const none = new HermesProfileSetup(
      missing.setting,
      "http://127.0.0.1:4431",
      missing.environment,
    );
    const first = await serve(missing.setting, none);
    const refused = await first.call("/agent/hermes-profile", "POST");
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toMatch(
      /Hermes was not found on this machine/,
    );
    expect(existsSync(missing.home)).toBe(false);

    // A closed provider from the environment wins over the saved one: refused.
    const closed = await machine({
      env: { GENOBI_AGENT_HERMES_PROVIDER: "openai-codex" },
    });
    const second = await serve(
      closed.setting,
      new HermesProfileSetup(
        closed.setting,
        "http://127.0.0.1:4431",
        closed.environment,
      ),
    );
    const open = await second.call("/agent/hermes-profile", "POST");
    expect(open.status).toBe(400);
    expect((await open.json()).error).toBe(OPEN_ROUTE_REFUSAL);
    expect(existsSync(path.dirname(path.dirname(closed.home)))).toBe(false);

    // Without the studio's header, or from an agent's session: refused.
    const plain = await fetch(`${second.base}/agent/hermes-profile`, {
      method: "POST",
    });
    expect(plain.status).toBe(403);
    second.who.agent = true;
    const agent = await second.call("/agent/hermes-profile", "POST");
    expect(agent.status).toBe(403);
    expect((await agent.json()).code).toBe("agent_nested");
  });

  it("reports the failed step, one setup at a time, and never a path", async () => {
    const m = await machine();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const run: HermesRun = async (args) => {
      if (args[0] === "profile") return gate;
      if (args[0] === "config") throw new Error("hermes config set failed.");
    };
    const profile = new HermesProfileSetup(
      m.setting,
      "http://127.0.0.1:4431",
      m.environment,
      () => run,
    );
    const { call } = await serve(m.setting, profile);
    expect((await call("/agent/hermes-profile", "POST")).status).toBe(202);
    expect((await call("/agent/hermes-profile", "POST")).status).toBe(409);
    expect(await (await call("/agent/hermes-profile")).json()).toMatchObject({
      phase: "running",
      steps: { create: "running" },
    });
    release();
    expect(await finished(call)).toEqual({
      phase: "failed",
      steps: { check: "done", create: "done", apply: "failed" },
      error: "hermes config set failed.",
    });
    // A file system error names a path: it is replaced by a fixed sentence.
    const leaky = new HermesProfileSetup(
      m.setting,
      "http://127.0.0.1:4431",
      m.environment,
      () => async () => {
        throw new Error(`EACCES: permission denied, mkdir '${m.root}/x'`);
      },
    );
    await leaky.start("person");
    await leaky.settled();
    const failed = leaky.status("person");
    expect(failed.error).toMatch(/Hermes could not be set up/);
    expect(JSON.stringify(failed)).not.toContain(m.root);
    // Another studio session never reads this one's setup.
    expect(leaky.status("someone-else")).toEqual({ phase: "idle", steps: {} });
  });
});

describe("Check again", () => {
  it("re-runs the sign-in probe on every read and is never cached", async () => {
    const m = await machine({ hermes: false });
    let answers = 0;
    const signIn = vi.fn(async () => [
      {
        runner: "hermes" as const,
        name: "Hermes",
        installed: true,
        signedIn: ++answers > 1,
      },
    ]);
    const profile = new HermesProfileSetup(m.setting, "http://127.0.0.1:1");
    const { call } = await serve(m.setting, profile, signIn);
    const first = await call("/agent/sign-in");
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect((await first.json()).harnesses[0].signedIn).toBe(false);
    // Hermes installed since the server started is found on the next read.
    expect(m.setting.config.hermes).toBeUndefined();
    await copyFile(
      path.resolve("tests/fixtures/agent/fake-hermes.mjs"),
      path.join(m.bin, "hermes"),
    );
    await chmod(path.join(m.bin, "hermes"), 0o755);
    const second = await call("/agent/sign-in");
    expect((await second.json()).harnesses[0].signedIn).toBe(true);
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(m.setting.config.hermes).toBe(path.join(m.bin, "hermes"));
  });

  it("asks the browser for a fresh answer", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ harnesses: [] }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    await readSignIn();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/agent/sign-in",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
