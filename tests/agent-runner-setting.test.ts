import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app";
import { agentConfig, runnerStatus } from "../server/agent-config";
import {
  AGENT_RUNNER_FILE,
  AgentRunnerSetting,
  parseAgentRunnerChoice,
  savedAgentConfig,
} from "../server/agent-runner-setting";

// The harness chosen in setup (`.local/agent.json`): read when
// GENOBI_AGENT_RUNNER is unset, never over it; Codex is recorded but reported
// as not supported yet.

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function folder() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "genobi-runner-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

describe("the runner the agent config reads", () => {
  it("takes the saved runner when the environment names none", async () => {
    const config = await agentConfig(
      { PATH: "" },
      {
        runner: "hermes",
        hermesModel: "deepseek/deepseek-v4-pro",
        hermesProvider: "nous",
      },
    );
    expect(config.runner).toBe("hermes");
    expect(config.hermesModel).toBe("deepseek/deepseek-v4-pro");
    expect(config.hermesProvider).toBe("nous");
  });
  it("lets each environment variable win over the saved choice", async () => {
    const config = await agentConfig(
      {
        PATH: "",
        GENOBI_AGENT_RUNNER: "claude",
        GENOBI_AGENT_HERMES_PROVIDER: "openrouter",
      },
      { runner: "hermes", hermesProvider: "nous" },
    );
    expect(config.runner).toBe("claude");
    expect(config.hermesProvider).toBe("openrouter");
  });
  it("reports Codex as chosen but not supported yet", async () => {
    const status = await runnerStatus(
      await agentConfig({ PATH: "" }, { runner: "codex" }),
    );
    expect(status.available).toBe(false);
    expect(status.message).toMatch(/not supported yet/);
    expect(status).not.toHaveProperty("runner");
  });
  it("points a saved Hermes runner at setup, and past it once both are saved", async () => {
    const env = {
      PATH: "",
      HOME: await folder(),
      GENOBI_AGENT_HERMES: "/bin/sh",
    };
    const unset = await runnerStatus(
      await agentConfig(env, { runner: "hermes" }),
    );
    expect(unset).toMatchObject({ available: false, runner: "hermes" });
    expect(unset.message).toMatch(/setup's Connect step/);
    const both = await runnerStatus(
      await agentConfig(env, {
        runner: "hermes",
        hermesModel: "deepseek/deepseek-v4-pro",
        hermesProvider: "nous",
      }),
    );
    // Model and provider came from the file: only the profile is missing.
    expect(both.message).not.toMatch(/GENOBI_AGENT_HERMES_(MODEL|PROVIDER)/);
    expect(both.message).toMatch(/not set up yet.*Set up Hermes/);
    expect(both.setup).toBe("hermes-profile");
  });
  it("resolves a tool's config from the saved choice", async () => {
    const directory = await folder();
    await writeFile(
      path.join(directory, AGENT_RUNNER_FILE),
      JSON.stringify({ runner: "hermes", hermesProvider: "nous" }),
    );
    const config = await savedAgentConfig(directory, {
      PATH: "",
      GENOBI_AGENT_HERMES_MODEL: "deepseek/deepseek-v4-pro",
    });
    expect(config).toMatchObject({
      runner: "hermes",
      hermesModel: "deepseek/deepseek-v4-pro",
      hermesProvider: "nous",
    });
  });
  it("is off with no runner saved and none in the environment", async () => {
    const config = await agentConfig({ PATH: "" }, { runner: null });
    expect(config.runner).toBeUndefined();
    expect((await runnerStatus(config)).message).toMatch(/Choose one in setup/);
  });
});

describe("the saved choice", () => {
  it("refuses a closed route, a bad name and unknown fields", () => {
    for (const body of [
      { runner: "hermes", hermesProvider: "anthropic" },
      { runner: "hermes", hermesModel: "openai/gpt-5" },
      { runner: "hermes", hermesModel: "a model; rm -rf /" },
      { runner: "gemini" },
      { runner: "claude", binary: "/tmp/x" },
      [],
    ])
      expect(() => parseAgentRunnerChoice(body)).toThrow();
    expect(
      parseAgentRunnerChoice({
        runner: "hermes",
        hermesModel: " deepseek/deepseek-v4-pro\u0000",
        hermesProvider: "Nous",
      }),
    ).toEqual({
      runner: "hermes",
      hermesModel: "deepseek/deepseek-v4-pro",
      hermesProvider: "nous",
    });
  });
  it("writes an owner-only file and applies it to the held config", async () => {
    const directory = await folder();
    const setting = await AgentRunnerSetting.load(directory, undefined, {
      PATH: "",
    });
    const held = setting.config;
    expect(held.runner).toBeUndefined();
    expect(await setting.save({ runner: "claude" })).toEqual({
      saved: { runner: "claude" },
      environment: false,
      hermesProvider: false,
    });
    expect(setting.config).toBe(held);
    expect(held.runner).toBe("claude");
    const file = path.join(directory, AGENT_RUNNER_FILE);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      runner: "claude",
    });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    // A restart reads it back.
    const again = await AgentRunnerSetting.load(directory, undefined, {
      PATH: "",
    });
    expect(again.config.runner).toBe("claude");
  });
  it("says whether the server holds a Hermes provider, saved or from the environment", async () => {
    const directory = await folder();
    const fromEnv = await AgentRunnerSetting.load(directory, undefined, {
      PATH: "",
      GENOBI_AGENT_HERMES_PROVIDER: "nous",
    });
    expect(fromEnv.state()).toMatchObject({ hermesProvider: true });
    expect(JSON.stringify(fromEnv.state())).not.toContain("nous");
    const saved = await AgentRunnerSetting.load(directory, undefined, {
      PATH: "",
    });
    expect(saved.state().hermesProvider).toBe(false);
    await saved.save({ runner: "claude", hermesProvider: "nous" });
    expect(saved.state().hermesProvider).toBe(true);
  });
  it("ignores a malformed file and never rebuilds an injected config", async () => {
    const directory = await folder();
    await writeFile(path.join(directory, AGENT_RUNNER_FILE), "{not json");
    const injected = await agentConfig({ PATH: "" });
    const setting = await AgentRunnerSetting.load(directory, injected, {
      PATH: "",
    });
    expect(setting.state().saved).toEqual({ runner: null });
    await setting.save({ runner: "claude" });
    expect(injected.runner).toBeUndefined();
  });
});

describe("/api/settings/agent-runner", () => {
  async function server() {
    const directory = path.join(await folder(), ".local");
    const created = await createApp({ directory, publicDirectory: directory });
    const listener = await new Promise<Server>((resolve) => {
      const s = created.app.listen(0, "127.0.0.1", () => resolve(s));
    });
    cleanups.push(
      () => new Promise<void>((resolve) => listener.close(() => resolve())),
    );
    const address = listener.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const base = `http://127.0.0.1:${address.port}`;
    const studio = {
      "X-Genobi-Agent": "1",
      "Content-Type": "application/json",
    };
    return {
      base,
      directory,
      save: (body: object, headers: Record<string, string> = studio) =>
        fetch(`${base}/api/settings/agent-runner`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      status: async () =>
        (await fetch(`${base}/api/agent/status`, { headers: studio })).json(),
    };
  }

  it("needs the studio's header, then records the choice", async () => {
    vi.stubEnv("GENOBI_AGENT_RUNNER", "");
    vi.stubEnv("GENOBI_AGENT_HERMES_PROVIDER", "");
    const s = await server();
    const refused = await s.save(
      { runner: "codex" },
      { "Content-Type": "application/json" },
    );
    expect(refused.status).toBe(403);
    const cross = await s.save(
      { runner: "codex" },
      {
        "X-Genobi-Agent": "1",
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "cross-site",
      },
    );
    expect(cross.status).toBe(403);
    const saved = await s.save({ runner: "codex" });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({
      saved: { runner: "codex" },
      environment: false,
      hermesProvider: false,
    });
    const status = await s.status();
    expect(status).toMatchObject({ available: false });
    expect(status.message).toMatch(/not supported yet/);
    const bad = await s.save({ runner: "hermes", hermesProvider: "openai" });
    expect(bad.status).toBe(400);
  });

  it("refuses an agent-marked session on the setting and the sign-in", async () => {
    vi.stubEnv("GENOBI_AGENT_RUNNER", "");
    const s = await server();
    const agent = {
      "X-Genobi-Agent": "1",
      "X-Genobi-Agent-Session": "1",
      "Content-Type": "application/json",
    };
    const saved = await s.save({ runner: "claude" }, agent);
    expect(saved.status).toBe(403);
    expect((await saved.json()).code).toBe("agent_nested");
    for (const [method, route] of [
      ["GET", "/api/settings/agent-runner"],
      ["GET", "/api/agent/sign-in"],
      ["POST", "/api/agent/sign-in/claude"],
    ]) {
      const refused = await fetch(`${s.base}${route}`, {
        method,
        headers: agent,
      });
      expect(refused.status, route).toBe(403);
      expect((await refused.json()).code, route).toBe("agent_nested");
    }
    await expect(
      readFile(path.join(s.directory, AGENT_RUNNER_FILE), "utf8"),
    ).rejects.toThrow();
  });

  it("keeps the environment's runner when GENOBI_AGENT_RUNNER is set", async () => {
    vi.stubEnv("GENOBI_AGENT_RUNNER", "claude");
    const s = await server();
    const saved = await s.save({ runner: "codex" });
    expect(await saved.json()).toMatchObject({ environment: true });
    expect(await s.status()).toMatchObject({ runner: "claude" });
  });
});
