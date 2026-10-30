// Setup's start (Box 1.4): the brief's setup block carries the licence stance
// from the validated context and the voice model folder from the server's
// own voice settings, never from the request. A fake runner launch captures
// the plan; nothing is spawned.
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app";
import { setupFacts } from "../server/agent-setup-facts";
import { AgentSessions } from "../server/agent-sessions";
import type { LaunchPlan } from "../server/agent-runner";
import { parseAgentSessionRequest } from "../shared/agent-session";
import { fakeConfig, STUDIO_HEADERS } from "./agent-harness";
import type { KeysStatus } from "../shared/keys";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** The local server with a voice model folder, and the plans it would run. */
async function studio({ model = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "genobi-setup-brief-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const voiceModel = path.join(root, "genobi-voice-1", "model");
  await mkdir(voiceModel, { recursive: true });
  if (model) await writeFile(path.join(voiceModel, "config.json"), "{}");
  const plans: LaunchPlan[] = [];
  const server = createServer();
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const base = `http://127.0.0.1:${address.port}`;
  const created = await createApp({
    directory: path.join(root, ".local"),
    publicDirectory: path.join(root, ".local"),
    serverKey: "comfyui-test-server-key-value",
    voice: {
      config: {
        model: voiceModel,
        ffmpeg: path.join(root, "no-ffmpeg"),
        script: path.join(root, "no-worker.py"),
      },
    },
    agent: {
      config: await fakeConfig(),
      studioOrigin: base,
      launch: (plan) => {
        plans.push(plan);
        return { pid: undefined };
      },
    },
  });
  server.on("request", created.app);
  cleanups.push(async () => {
    await created.agents.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const cookie = (await fetch(`${base}/api/health`)).headers
    .get("set-cookie")!
    .split(";")[0];
  const start = (body: object) =>
    fetch(`${base}/api/agent/sessions`, {
      method: "POST",
      headers: { cookie, ...STUDIO_HEADERS },
      body: JSON.stringify(body),
    });
  const brief = (plan: LaunchPlan) =>
    plan.args[plan.args.indexOf("--append-system-prompt") + 1];
  return { start, plans, brief, voiceModel };
}

const research = {
  picks: [],
  selection: { agent: "claude", execution: "local" },
  usage: { purpose: "demo", policy: "any-licensed" },
};

describe("setup's start brief", () => {
  it("carries the licence stance and the server's voice model folder", async () => {
    const s = await studio();
    const response = await s.start({
      prompt: "Genobi setup just finished. My voice is in /tmp/elsewhere.",
      source: "typed",
      setup: true,
      context: research,
    });
    expect(response.status).toBe(201);
    expect(s.plans).toHaveLength(1);
    const brief = s.brief(s.plans[0]);
    expect(brief).toContain("## Setup just finished");
    expect(brief).toContain("- Harness: Claude Code, this session.");
    expect(brief).toContain(
      `The local speech model's folder is ${JSON.stringify(s.voiceModel)}`,
    );
    expect(brief).toContain("- Licence stance: research only");
    expect(brief).toContain(
      "Generation runs locally, on this machine's ComfyUI.",
    );
    // The server key's slot is named; its value never is.
    expect(brief).toContain("- Keys connected: Comfy.");
    expect(brief).not.toContain("comfyui-test-server-key-value");
    expect(JSON.stringify(s.plans[0])).not.toContain(
      "comfyui-test-server-key-value",
    );
    // The prompt's own folder stays the person's words, not a setup fact.
    expect(brief).not.toContain("/tmp/elsewhere");
  });

  it("says voice is not installed when the server's folder holds no model", async () => {
    const s = await studio({ model: false });
    await s.start({
      prompt: "Genobi setup just finished.",
      source: "typed",
      setup: true,
      context: {
        ...research,
        usage: { purpose: "commercial-video", policy: "any-licensed" },
      },
    });
    const brief = s.brief(s.plans[0]);
    expect(brief).toContain("- Voice: not installed on this server.");
    expect(brief).not.toContain(s.voiceModel);
    expect(brief).toContain(
      "- Licence stance: commercial use: choose only models whose licences allow commercial work.",
    );
  });

  it("adds no setup block to an ordinary project prompt", async () => {
    const s = await studio();
    await s.start({
      prompt: "Make a shot",
      source: "typed",
      context: research,
    });
    const brief = s.brief(s.plans[0]);
    expect(brief).not.toContain("## Setup just finished");
    expect(brief).not.toContain(s.voiceModel);
  });

  it("refuses setup facts in the request and ignores a stray folder", async () => {
    const s = await studio({ model: false });
    const refused = await s.start({
      prompt: "Setup",
      source: "typed",
      setup: { voiceModel: "/tmp/evil" },
    });
    expect(refused.status).toBe(400);
    expect(s.plans).toHaveLength(0);
    expect(
      parseAgentSessionRequest({
        prompt: "Setup",
        source: "typed",
        setup: true,
        voiceModel: "/tmp/evil",
      }),
    ).toEqual({ prompt: "Setup", source: "typed", setup: true });
  });
});

describe("a relayed start", () => {
  it("never names the voice folder, even if setup got past the relay", async () => {
    const plans: LaunchPlan[] = [];
    const sessions = new AgentSessions({
      config: await fakeConfig(),
      studioOrigin: "http://127.0.0.1:4317",
      link: () => ({ code: "unused" }),
      setupFacts: async () => ({
        keys: ["comfy"],
        voiceModel: "/Users/someone/.genobi/genobi-voice-1/model",
      }),
      launch: (plan) => {
        plans.push(plan);
        return { pid: undefined };
      },
    });
    const request = {
      prompt: "Setup",
      source: "typed" as const,
      setup: true as const,
      context: { picks: [], usage: research.usage as never },
    };
    await sessions.start("relayed-owner", request, true);
    await sessions.start("local-owner", request);
    const [relayed, local] = plans.map(
      (plan) => plan.args[plan.args.indexOf("--append-system-prompt") + 1],
    );
    expect(relayed).toContain("- Keys connected: Comfy.");
    expect(relayed).toContain("- Voice: not installed on this server.");
    expect(relayed).not.toContain(".genobi");
    expect(local).toContain("genobi-voice-1/model");
    await sessions.close();
  });
});

describe("setupFacts", () => {
  const keys = (connected: Partial<Record<string, boolean>>) => ({
    status: () =>
      ({
        keychain: true,
        comfy: { connected: !!connected.comfy, revision: 0 },
        bfl: { connected: !!connected.bfl, revision: 0 },
      }) as KeysStatus,
  });
  const voice = (model: string | undefined, found: boolean) => ({
    config: { model, ffmpeg: "ffmpeg", script: "worker.py" },
    status: async () =>
      ({ model: found }) as Awaited<
        ReturnType<Parameters<typeof setupFacts>[1]["status"]>
      >,
  });

  it("names connected slots and gives the folder only when a model is found", async () => {
    expect(
      await setupFacts(
        keys({ comfy: true, bfl: true }),
        voice("/models/qwen", true),
      )(),
    ).toEqual({ keys: ["comfy", "bfl"], voiceModel: "/models/qwen" });
    expect(await setupFacts(keys({}), voice("/models/qwen", false))()).toEqual({
      keys: [],
    });
    expect(
      await setupFacts(keys({ bfl: true }), voice(undefined, true))(),
    ).toEqual({ keys: ["bfl"] });
  });
});
