// Agent sessions run by a fake Hermes (tests/fixtures/agent/fake-hermes.mjs):
// the same guarantees as Claude Code's — the session's tools and mark, no
// server keys, waiting on a paid refusal, Stop and the time limit, and every
// process it started ended, including children Hermes puts in sessions of
// their own.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSessions } from "../server/agent-sessions";
import { GENOBI_TOOLS, type LaunchPlan } from "../server/agent-runner";
import { agentStudio, alive, fakeHermesConfig } from "./agent-harness";

const hermesStudio = async (options: Parameters<typeof agentStudio>[0] = {}) =>
  agentStudio({
    config: await fakeHermesConfig(),
    sampleMs: 50,
    ...options,
  });

/** Children the fake reported; ended after each test even if it failed. */
const children: number[] = [];
afterEach(() => {
  for (const pid of children.splice(0))
    try {
      process.kill(-pid, "SIGKILL"); // each is a group of its own
    } catch {
      // Already gone, as it should be.
    }
});

const gone = async (pid: number) => {
  for (let i = 0; i < 160 && alive(pid); i++)
    await new Promise((r) => setTimeout(r, 50));
  return !alive(pid);
};

// A session's start runs the fake's profile commands as processes; give a
// loaded machine room.
describe("Hermes sessions", { timeout: 20_000 }, () => {
  it("runs to a summary and its progress lines", async () => {
    const studio = await hermesStudio();
    const cookie = await studio.fresh();
    const { body: status } = await studio.call(cookie, "/status");
    // macOS can open a Terminal session too (docs/agent-setup.md).
    expect(status).toEqual({
      available: true,
      runner: "hermes",
      ...(process.platform === "darwin" ? { terminal: true } : {}),
    });
    const started = await studio.start(cookie, "Check the studio");
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({
      runner: "hermes",
      status: "starting",
    });
    const done = await studio.settle(cookie, started.body.id);
    expect(done.status).toBe("done");
    expect(done.summary).toBe("The studio is up.\n\nNothing was spent.");
    expect(done.lines).toEqual([
      "Starting Hermes…",
      "Hermes on deepseek/deepseek-v4-pro.",
      "Checking the studio.",
      "Using genobi_status",
      "The studio is up.",
      "Nothing was spent.",
    ]);
  });

  it("runs in the genobi profile with the Genobi tools only, marked, and no keys", async () => {
    vi.stubEnv("COMFY_API_KEY", "comfy-secret");
    vi.stubEnv("BFL_API_KEY", "bfl-secret");
    try {
      const studio = await hermesStudio();
      const cookie = await studio.fresh();
      const { body } = await studio.start(cookie, "config");
      const done = await studio.settle(cookie, body.id);
      expect(done.lines).toEqual(
        expect.arrayContaining([
          "plugins genobi",

          "marked 1",
          "toolsets genobi",
          "keys none",
        ]),
      );
      expect(
        done.lines
          .filter((line) => line.startsWith("include "))
          .flatMap((line) => line.slice(8).split(",")),
      ).toEqual(GENOBI_TOOLS);
      expect(done.lines.join()).not.toContain("genobi_submit");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("ends as waiting on a paid refusal, and as failed on an error or no sign-in", async () => {
    const studio = await hermesStudio();
    const [a, b, c] = [
      await studio.fresh(),
      await studio.fresh(),
      await studio.fresh(),
    ];
    const spend = await studio.start(a, "spend something");
    const fail = await studio.start(b, "fail please");
    const waiting = await studio.settle(a, spend.body.id);
    expect(waiting.status).toBe("waiting");
    expect(waiting.lines).toContain(
      "A paid step needs your approval in the studio.",
    );
    const failed = await studio.settle(b, fail.body.id);
    expect(failed.status).toBe("failed");
    expect(failed.summary).toBe("The agent stopped before it finished.");
    const signin = await studio.start(c, "signin");
    expect((await studio.settle(c, signin.body.id)).summary).toMatch(
      /could not sign in/,
    );
  });

  it("stops only its own process groups", async () => {
    const signals: [number, NodeJS.Signals][] = [];
    const studio = await hermesStudio({
      kill: (pid, signal) => {
        signals.push([pid, signal]);
        process.kill(pid, signal);
      },
    });
    const a = await studio.fresh();
    const b = await studio.fresh();
    const first = await studio.start(a, "hang one");
    const second = await studio.start(b, "hang two");
    const pidA = Number(
      (await studio.waitFor(a, first.body.id, /^pid (\d+)$/))[1],
    );
    const pidB = Number(
      (await studio.waitFor(b, second.body.id, /^pid (\d+)$/))[1],
    );
    await studio.call(a, `/sessions/${first.body.id}/stop`, { method: "POST" });
    expect((await studio.settle(a, first.body.id)).status).toBe("stopped");
    expect(signals).toEqual([[-pidA, "SIGTERM"]]);
    expect(alive(pidA)).toBe(false);
    expect(alive(pidB)).toBe(true);
    await studio.call(b, `/sessions/${second.body.id}/stop`, {
      method: "POST",
    });
    expect((await studio.settle(b, second.body.id)).status).toBe("stopped");
  });

  it("on Stop, ends a child in a session of its own that ignores SIGTERM", async () => {
    const signals: [number, NodeJS.Signals][] = [];
    const studio = await hermesStudio({
      graceMs: 200,
      kill: (pid, signal) => {
        signals.push([pid, signal]);
        process.kill(pid, signal);
      },
    });
    const cookie = await studio.fresh();
    const { body } = await studio.start(cookie, "hang stubborn");
    const child = Number(
      (await studio.waitFor(cookie, body.id, /^child (\d+)$/))[1],
    );
    children.push(child);
    const pid = Number(
      (await studio.waitFor(cookie, body.id, /^pid (\d+)$/))[1],
    );
    await studio.call(cookie, `/sessions/${body.id}/stop`, { method: "POST" });
    expect((await studio.settle(cookie, body.id)).status).toBe("stopped");
    expect(await gone(child)).toBe(true);
    expect(signals).toEqual(
      expect.arrayContaining([
        [-pid, "SIGTERM"],
        [-child, "SIGTERM"],
        [-child, "SIGKILL"],
      ]),
    );
  });

  it("ends such a child when Hermes finishes on its own", async () => {
    const studio = await hermesStudio({ graceMs: 200 });
    const cookie = await studio.fresh();
    const { body } = await studio.start(cookie, "stubborn");
    const child = Number(
      (await studio.waitFor(cookie, body.id, /^child (\d+)$/))[1],
    );
    children.push(child);
    expect((await studio.settle(cookie, body.id)).status).toBe("done");
    expect(await gone(child)).toBe(true);
  });

  it("ends a child orphaned before any look, by the session's token", async () => {
    // No periodic look at all: only the token can find the child once the
    // runner has exited and the child belongs to init.
    const studio = await hermesStudio({ graceMs: 200, sampleMs: 600_000 });
    const cookie = await studio.fresh();
    const stranger = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000);"],
      {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, GENOBI_AGENT_RUN: "not-this-session" },
      },
    );
    stranger.unref();
    try {
      const { body } = await studio.start(cookie, "orphan");
      const child = Number(
        (await studio.waitFor(cookie, body.id, /^child (\d+)$/))[1],
      );
      children.push(child);
      await studio.settle(cookie, body.id);
      expect(await gone(child)).toBe(true);
      expect(alive(stranger.pid!)).toBe(true);
    } finally {
      // Only the process this test started, by its own group.
      process.kill(-stranger.pid!, "SIGKILL");
    }
  });

  it("waits for such a child before shutdown resolves", async () => {
    const studio = await hermesStudio({ graceMs: 200 });
    const cookie = await studio.fresh();
    const { body } = await studio.start(cookie, "hang stubborn");
    const child = Number(
      (await studio.waitFor(cookie, body.id, /^child (\d+)$/))[1],
    );
    children.push(child);
    await studio.waitFor(cookie, body.id, /^pid (\d+)$/);
    await studio.agents.close();
    // Killed; on a loaded machine init may take a moment to reap it.
    expect(await gone(child)).toBe(true);
  });

  it("stops a session that runs past its time", async () => {
    const studio = await agentStudio({
      config: await fakeHermesConfig({ timeoutMs: 300 }),
    });
    const cookie = await studio.fresh();
    const { body } = await studio.start(cookie, "hang forever");
    const ended = await studio.settle(cookie, body.id);
    expect(ended.status).toBe("failed");
    expect(ended.summary).toMatch(/ran past/);
  });

  it("hands the link code to Hermes, updates the profile for this studio and clears its scratch folder", async () => {
    const plans: LaunchPlan[] = [];
    let exit = () => {};
    const config = await fakeHermesConfig({
      browser: true,
      npx: "/usr/bin/npx",
    });
    const sessions = new AgentSessions({
      config,
      studioOrigin: "http://127.0.0.1:4431",
      link: () => ({ code: "LINK2345" }),
      launch: (plan, on) => {
        plans.push(plan);
        exit = () => on.exit(0);
        return { pid: undefined };
      },
    });
    await sessions.start("owner", {
      prompt: "Punch in on the drop",
      source: "voice",
      copyId: "house-template",
    });
    const [plan] = plans;
    expect(plan.env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("`LINK2345`");
    expect(plan.env.HERMES_HOME).toBe(config.hermesHome);
    const recorded = JSON.parse(
      await readFile(path.join(config.hermesHome!, "fake-config.json"), "utf8"),
    );
    expect(recorded["mcp_servers.genobi"].env.GENOBI_URL).toBe(
      "http://127.0.0.1:4431",
    );
    expect(existsSync(plan.cwd)).toBe(true);
    exit();
    await vi.waitFor(() => expect(existsSync(plan.cwd)).toBe(false));
    // The profile stays; only the session's own folder goes.
    expect(
      existsSync(path.join(config.hermesHome!, "genobi-profile.json")),
    ).toBe(true);
  });

  it("answers 503 and spawns nothing while the profile is not set up", async () => {
    const config = await fakeHermesConfig();
    await rm(path.join(config.hermesHome!, "genobi-profile.json"));
    const launched = vi.fn(() => ({ pid: undefined }));
    const sessions = new AgentSessions({
      config,
      studioOrigin: "http://127.0.0.1:4431",
      link: () => ({ code: "LINK2345" }),
      launch: launched,
    });
    await expect(
      sessions.start("owner", { prompt: "Hi", source: "typed" }),
    ).rejects.toThrow(/not set up yet/);
    expect(launched).not.toHaveBeenCalled();
  });
});
