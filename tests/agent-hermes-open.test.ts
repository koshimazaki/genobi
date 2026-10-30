// Hermes as the open route: the status, the runner and the profile setup
// refuse an Anthropic or OpenAI model or provider before Hermes runs, and
// the `genobi` profile pins the open model with cross-provider fallback off.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agentConfig, runnerStatus } from "../server/agent-config";
import { hermesPlan } from "../server/agent-hermes";
import {
  applyProfile,
  profileSettings,
  type HermesRun,
} from "../server/agent-hermes-profile";
import { OPEN_ROUTE_REFUSAL } from "../shared/open-route";
import { agentStudio, fakeHermesConfig, fakeMachine } from "./agent-harness";

const recorder = () => {
  const calls: string[][] = [];
  const run: HermesRun = async (args) => {
    calls.push(args);
  };
  return { calls, run };
};

const closed = [
  { hermesModel: "anthropic/claude-sonnet-5" },
  { hermesModel: "openai/gpt-5.5" },
  { hermesModel: "o3-pro" },
  { hermesProvider: "anthropic" },
  { hermesProvider: "openai-codex" },
  { hermesProvider: "auto" },
];

describe("the open route", { timeout: 20_000 }, () => {
  it("marks a closed model or provider from the environment", async () => {
    const env = (model: string, provider: string) =>
      agentConfig({
        GENOBI_AGENT_RUNNER: "hermes",
        GENOBI_AGENT_HERMES_MODEL: model,
        GENOBI_AGENT_HERMES_PROVIDER: provider,
      });
    expect((await env("deepseek/deepseek-v4-pro", "nous")).hermesClosed).toBe(
      false,
    );
    expect((await env("qwen/qwen3-coder", "deepseek")).hermesClosed).toBe(
      false,
    );
    expect((await env("claude-opus-4-8", "nous")).hermesClosed).toBe(true);
    expect(
      (await env("deepseek/deepseek-v4-pro", "chatgpt")).hermesClosed,
    ).toBe(true);
  });

  it("answers the status with the fixed sentence, never the value", async () => {
    const base = await fakeHermesConfig();
    for (const override of closed) {
      const status = await runnerStatus({ ...base, ...override });
      expect(status).toEqual({
        available: false,
        runner: "hermes",
        message: expect.stringContaining(OPEN_ROUTE_REFUSAL),
      });
      for (const value of Object.values(override))
        expect(status.message).not.toContain(value);
    }
    const noProvider = await runnerStatus({
      ...base,
      hermesProvider: undefined,
    });
    expect(noProvider).toMatchObject({ available: false, runner: "hermes" });
    expect(noProvider.message).toMatch(/GENOBI_AGENT_HERMES_PROVIDER/);
  });

  it("starts no session and never runs Hermes for a closed model or provider", async () => {
    const base = await fakeHermesConfig();
    const recorded = path.join(base.hermesHome!, "fake-config.json");
    const before = await readFile(recorded, "utf8");
    for (const override of closed) {
      const studio = await agentStudio({ config: { ...base, ...override } });
      const cookie = await studio.fresh();
      const started = await studio.start(cookie, "Check the studio");
      expect(started.status).toBe(503);
      expect(started.body.code).toBe("agent_unavailable");
      // A session's start would have run the fake's `config set` for the
      // studio's port; the profile is as the harness left it.
      expect(await readFile(recorded, "utf8")).toBe(before);
      // The plan itself refuses too, before the profile or Hermes.
      const { calls, run } = recorder();
      const { root: workdir } = await fakeMachine();
      await expect(
        hermesPlan(
          { ...base, ...override },
          {
            prompt: "x",
            studioOrigin: "http://127.0.0.1:4431",
            ticketUrl: "http://127.0.0.1:4431/api/agent/ticket/T",
            workdir,
          },
          {},
          { run },
        ),
      ).rejects.toThrow(/open route|not configured/);
      expect(calls).toEqual([]);
    }
  });

  it("refuses profile settings for a closed pair, or without a provider", async () => {
    const base = await fakeHermesConfig();
    for (const override of closed)
      expect(() =>
        profileSettings({ ...base, ...override }, "http://127.0.0.1:1"),
      ).toThrow(OPEN_ROUTE_REFUSAL);
    expect(() =>
      profileSettings(
        { ...base, hermesProvider: undefined },
        "http://127.0.0.1:1",
      ),
    ).toThrow(/model and provider/);
  });

  it("pins the model and provider with fallback off in the written config", async () => {
    const config = await fakeHermesConfig();
    const written = JSON.parse(
      await readFile(path.join(config.hermesHome!, "fake-config.json"), "utf8"),
    );
    expect(written).toMatchObject({
      "model.default": "deepseek/deepseek-v4-pro",
      "model.provider": "nous",
      fallback_providers: [],
      fallback_model: [],
    });
  });

  it("sets the pins again when the profile's config.yaml changed", async () => {
    const config = await fakeHermesConfig();
    const home = config.hermesHome!;
    const settings = profileSettings(config, "http://127.0.0.1:1");
    const { calls, run } = recorder();
    expect(await applyProfile(home, settings, run, {})).toBe(false);
    // Someone adds a fallback with `hermes -p genobi fallback add`.
    await writeFile(
      path.join(home, "config.yaml"),
      "fallback_providers:\n  - provider: anthropic\n    model: claude-sonnet-5\n",
    );
    expect(await applyProfile(home, settings, run, {})).toBe(true);
    // A top-level key is replaced with Hermes' --force, even a mapping.
    expect(calls).toContainEqual([
      "config",
      "set",
      "fallback_providers",
      "[]",
      "--force",
    ]);
    expect(calls).toContainEqual([
      "config",
      "set",
      "fallback_model",
      "[]",
      "--force",
    ]);
    expect(calls).toContainEqual(["config", "set", "model.provider", "nous"]);
    calls.length = 0;
    expect(await applyProfile(home, settings, run, {})).toBe(false);
    expect(calls).toEqual([]);
  });
});

/**
 * Runs `npm run agent:hermes-profile` against the fake Hermes, with `saved`
 * as the studio's `.local/agent.json` (none by default, never the checkout's).
 */
async function setup(model?: string, provider?: string, saved?: object) {
  const config = await fakeHermesConfig();
  const { root } = await fakeMachine();
  const hermesRoot = path.join(root, "fresh-root");
  const settings = path.join(root, "studio-local");
  await mkdir(settings, { recursive: true });
  if (saved)
    await writeFile(path.join(settings, "agent.json"), JSON.stringify(saved));
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: root,
    GENOBI_AGENT_HERMES: config.hermes!,
    GENOBI_AGENT_HERMES_ROOT: hermesRoot,
    GENOBI_AGENT_SETTINGS_DIR: settings,
    ...(model ? { GENOBI_AGENT_HERMES_MODEL: model } : {}),
    ...(provider ? { GENOBI_AGENT_HERMES_PROVIDER: provider } : {}),
  };
  const result = await new Promise<{ code: number; out: string }>((resolve) =>
    execFile(
      path.resolve("node_modules/.bin/tsx"),
      ["scripts/setup-hermes-profile.ts"],
      { env, timeout: 15_000 },
      (error, stdout, stderr) =>
        resolve({
          code: error ? Number(error.code ?? 1) : 0,
          out: `${stdout}${stderr}`,
        }),
    ),
  );
  return { ...result, home: path.join(hermesRoot, "profiles", "genobi") };
}

describe("the profile setup", { timeout: 30_000 }, () => {
  it("refuses a closed model or provider before creating anything", async () => {
    for (const [model, provider] of [
      ["anthropic/claude-sonnet-5", "nous"],
      ["deepseek/deepseek-v4-pro", "openai-codex"],
    ]) {
      const { code, out, home } = await setup(model, provider);
      expect(code).toBe(1);
      expect(out).toContain("open route");
      expect(existsSync(path.dirname(path.dirname(home)))).toBe(false);
    }
  });

  it("refuses without a provider, and pins an open one with fallback off", async () => {
    const missing = await setup("deepseek/deepseek-v4-pro");
    expect(missing.code).toBe(1);
    expect(missing.out).toMatch(/GENOBI_AGENT_HERMES_PROVIDER/);
    expect(existsSync(missing.home)).toBe(false);

    const { code, out, home } = await setup("deepseek/deepseek-v4-pro", "nous");
    expect(code).toBe(0);
    expect(out).toContain("auth add nous --type oauth");
    const written = JSON.parse(
      await readFile(path.join(home, "fake-config.json"), "utf8"),
    );
    expect(written).toMatchObject({
      "model.default": "deepseek/deepseek-v4-pro",
      "model.provider": "nous",
      fallback_providers: [],
      fallback_model: [],
    });
  });

  it("reads the model and provider saved in setup, under the environment", async () => {
    const saved = {
      runner: "hermes",
      hermesModel: "deepseek/deepseek-v4-pro",
      hermesProvider: "nous",
    };
    const { code, out, home } = await setup(undefined, undefined, saved);
    expect(code).toBe(0);
    expect(out).toContain("auth add nous --type oauth");
    expect(
      JSON.parse(await readFile(path.join(home, "fake-config.json"), "utf8")),
    ).toMatchObject({
      "model.default": "deepseek/deepseek-v4-pro",
      "model.provider": "nous",
    });
    // The environment's provider still wins over the saved one.
    const closed = await setup(undefined, "openai-codex", saved);
    expect(closed.code).toBe(1);
    expect(closed.out).toContain("open route");
  });
});
