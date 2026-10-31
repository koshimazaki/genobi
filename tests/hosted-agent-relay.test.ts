import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type {
  AgentSession,
  AgentSessionRequest,
} from "../shared/agent-session";
const HOSTED_HEALTH = { ok: true, hasServerKey: false, hosted: true };
import { RunnerConnection } from "../server/runner-connection";
import { relayFixture } from "./runner-relay-fixture";
import { AgentSessions } from "../server/agent-sessions";
import { fakeConfig } from "./agent-harness";

afterEach(() => vi.unstubAllGlobals());

it("a local Hermes start without its binary refuses with an actionable setup message", async () => {
  const launch = vi.fn(() => ({ pid: undefined }));
  const sessions = new AgentSessions({
    config: await fakeConfig({ runner: "hermes", hermes: undefined }),
    studioOrigin: "http://127.0.0.1:4317",
    link: () => ({ code: "LINK2345" }),
    launch,
  });
  try {
    expect(await sessions.status()).toMatchObject({
      available: false,
      runner: "hermes",
      message: expect.stringMatching(
        /Hermes was not found.*Install it.*Check again/,
      ),
    });
    await expect(
      sessions.start("local-owner", {
        prompt: "Build a room",
        source: "typed",
      }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/Hermes was not found.*Install it/),
    });
    expect(launch).not.toHaveBeenCalled();
  } finally {
    await sessions.close();
  }
});

it("the hosted spawn action reaches the existing local launcher through the relay once", async () => {
  vi.resetModules();
  const f = relayFixture();
  const directory = await mkdtemp(path.join(os.tmpdir(), "hosted-spawn-"));
  let local: AgentSession | undefined;
  const agents = {
    status: async () => ({ available: true, runner: "hermes" as const }),
    start: vi.fn(
      async (
        _owner: string,
        request: AgentSessionRequest,
        _relayed?: boolean,
      ) => {
        local = {
          id: crypto.randomUUID(),
          runner: "hermes",
          status: "running",
          startedAt: new Date().toISOString(),
          prompt: request.prompt,
          lines: ["Using Genobi tools"],
        };
        return local;
      },
    ),
    read: () => local!,
    stop: () => ({ ...local!, status: "stopped" as const }),
  };
  const connection = new RunnerConnection(
    directory,
    agents,
    "http://127.0.0.1:4317",
    f.fetcher,
  );
  const browser = vi.fn(async (url: string, init?: RequestInit) =>
    url === "/api/health"
      ? Response.json(HOSTED_HEALTH)
      : f.fetcher(`https://genobi.pages.dev${url}`, init),
  );
  vi.stubGlobal("fetch", browser);
  try {
    const code = await f.store.pair("host-owner");
    await connection.connect("local-owner", {
      origin: "https://genobi.pages.dev",
      id: code.id,
      code: code.code,
      confirmed: true,
    });
    await connection.tick();
    const { spawnAgent } = await import("../src/agent/spawn");
    const { readAgentSession } = await import("../src/agent/api");
    const session = await spawnAgent({
      prompt: "Build a room",
      source: "typed",
      projectId: "studio-house",
      context: { picks: [] },
    });
    expect(session.status).toBe("starting");
    await connection.tick();
    await connection.tick();
    expect(agents.start).toHaveBeenCalledExactlyOnceWith(
      "local-owner",
      { prompt: "Build a room", source: "typed", context: { picks: [] } },
      true,
    );
    expect(await readAgentSession(session.id)).toMatchObject({
      status: "running",
      lines: ["Using Genobi tools"],
      localSessionUrl: `http://127.0.0.1:4317/?agentSession=${local!.id}`,
    });
    const start = browser.mock.calls.find(
      ([url, init]) => url === "/api/agent/sessions" && init?.method === "POST",
    )!;
    expect(new Headers(start[1]!.headers).get("Idempotency-Key")).toMatch(
      /^[a-f0-9-]{36}$/,
    );
    expect(
      browser.mock.calls.some(
        ([url]) =>
          url.startsWith("/api/projects") ||
          url === "/api/settings/agent-runner" ||
          url === "/api/agent/sign-in",
      ),
    ).toBe(false);
  } finally {
    await connection.close();
    f.db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
