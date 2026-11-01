import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentSession } from "../shared/agent-session";
import {
  DEFAULT_HOSTED_ORIGINS,
  RunnerConnection,
  cloudRunnerOrigin,
  hostedOrigins,
} from "../server/runner-connection";
import { relayFixture } from "./runner-relay-fixture";

const cleanups: (() => Promise<void>)[] = [];
// The fixture studio is trusted the way an operator trusts theirs.
beforeEach(() => {
  vi.stubEnv("GENOBI_HOSTED_ORIGINS", "https://studio.pages.dev");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const close of cleanups.splice(0)) await close();
});
async function fixture() {
  const cloud = relayFixture(),
    directory = await mkdtemp(path.join(os.tmpdir(), "genobi-relay-"));
  const sessions = new Map<string, AgentSession>();
  const agents = {
    status: vi.fn(async () => ({ available: true, runner: "hermes" as const })),
    start: vi.fn(async (_owner, request, _relayed?: boolean) => {
      const view: AgentSession = {
        id: crypto.randomUUID(),
        runner: "hermes",
        status: "running",
        prompt: request.prompt,
        startedAt: new Date().toISOString(),
        lines: ["Building scene"],
      };
      sessions.set(view.id, view);
      return view;
    }),
    read: vi.fn((id: string) => {
      const v = sessions.get(id);
      if (!v) throw new Error("Missing");
      return v;
    }),
    stop: vi.fn((id: string) => {
      const v = sessions.get(id);
      if (!v) throw new Error("Missing");
      v.status = "stopped";
      return v;
    }),
  };
  const transport = vi.fn(cloud.fetcher);
  const runner = new RunnerConnection(
    directory,
    agents,
    "http://127.0.0.1:4317",
    transport,
  );
  const pair = await cloud.store.pair("host-owner");
  const connect = () =>
    runner.connect("local-owner", {
      origin: "https://studio.pages.dev",
      id: pair.id,
      code: pair.code,
      confirmed: true,
    });
  cleanups.push(async () => {
    await runner.close();
    cloud.db.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    ...cloud,
    directory,
    runner,
    agents,
    sessions,
    pair,
    connect,
    transport,
  };
}
it("pairs end to end and launches the existing local agent once, with progress back to cloud", async () => {
  const f = await fixture();
  await f.connect();
  await f.runner.tick();
  expect(await f.store.status("host-owner")).toMatchObject({
    available: true,
    runner: "hermes",
  });
  const id = crypto.randomUUID();
  await f.store.start("host-owner", id, {
    prompt: "Build a scene",
    source: "typed",
  });
  await f.runner.tick();
  await f.runner.tick();
  expect(f.agents.start).toHaveBeenCalledTimes(1);
  expect(f.agents.start.mock.calls[0][0]).toBe("local-owner");
  // Marked as relayed, so a setup brief could never name a local folder.
  expect(f.agents.start.mock.calls[0][2]).toBe(true);
  expect(await f.store.read("host-owner", id)).toMatchObject({
    status: "running",
    lines: ["Building scene"],
  });
  await f.store.stop("host-owner", id);
  await f.runner.tick();
  await f.runner.tick();
  expect((await f.store.read("host-owner", id)).status).toBe("stopped");
  const stored = await readFile(
    path.join(f.directory, "runner-pair.json"),
    "utf8",
  );
  expect(stored).not.toContain(f.pair.code);
  expect(stored).not.toContain("Build a scene");
  expect(
    (await stat(path.join(f.directory, "runner-pair.json"))).mode & 0o777,
  ).toBe(0o600);
  expect(JSON.stringify(f.runner.status("local-owner"))).not.toContain(
    JSON.parse(stored).token,
  );
});
it("a lost claim reply recovers with the stored capability, without claiming twice", async () => {
  const f = await fixture();
  f.transport.mockImplementationOnce(async (input, init) => {
    await f.fetcher(input, init);
    throw new Error("reply lost");
  });
  await f.connect();
  await f.runner.tick();
  expect(await f.store.status("host-owner")).toMatchObject({ available: true });
  expect(
    f.transport.mock.calls.filter(([url]) => String(url).endsWith("/claim")),
  ).toHaveLength(1);
});
it("duplicate command delivery cannot start a second agent, including after local restart", async () => {
  const f = await fixture();
  await f.connect();
  await f.runner.tick();
  const command = {
    id: crypto.randomUUID(),
    request: { prompt: "Once", source: "typed" },
  };
  f.transport.mockResolvedValueOnce(Response.json({ command, stops: [] }));
  await f.runner.tick();
  f.transport.mockResolvedValueOnce(Response.json({ command, stops: [] }));
  await f.runner.tick();
  expect(f.agents.start).toHaveBeenCalledTimes(1);
  await f.runner.close();
  const restarted = new RunnerConnection(
    f.directory,
    f.agents,
    "http://127.0.0.1:4317",
    f.transport,
  );
  await restarted.load();
  f.transport.mockResolvedValueOnce(Response.json({ command, stops: [] }));
  restarted.resume();
  await restarted.tick();
  await restarted.close();
  expect(f.agents.start).toHaveBeenCalledTimes(1);
});
it("revocation and network loss stop paired sessions, and never launch a replay", async () => {
  const f = await fixture();
  await f.connect();
  await f.runner.tick();
  await f.store.start("host-owner", crypto.randomUUID(), {
    prompt: "Start",
    source: "typed",
  });
  await f.runner.tick();
  f.transport.mockRejectedValueOnce(new Error("Offline"));
  await f.runner.tick();
  expect(f.agents.stop).toHaveBeenCalled();
  await f.store.revoke("host-owner");
  await f.runner.tick();
  expect(f.agents.start).toHaveBeenCalledTimes(1);
  expect(f.runner.status("local-owner").message).toContain("unavailable");
});
it("refuses other local sessions and unsafe destinations; redirects are never followed", async () => {
  for (const url of [
    "http://studio.pages.dev",
    "https://127.0.0.1",
    "https://studio.pages.dev.evil.test",
    "https://studio.pages.dev/path",
    "https://user:pass@studio.pages.dev",
  ])
    expect(() => cloudRunnerOrigin(url)).toThrow();
  const f = await fixture();
  await f.connect();
  await f.runner.tick();
  await expect(f.runner.disconnect("stranger")).rejects.toMatchObject({
    status: 403,
  });
  expect(f.runner.status("stranger")).not.toHaveProperty("origin");
  expect(
    f.transport.mock.calls.every(([, init]) => init?.redirect === "error"),
  ).toBe(true);
});

it("pairs only with trusted studios and their own deployments", () => {
  const trusted = ["https://fluxstudio.pages.dev"];
  expect(cloudRunnerOrigin("https://fluxstudio.pages.dev/", trusted)).toBe(
    "https://fluxstudio.pages.dev",
  );
  // A deployment of the trusted Pages project is served by that project alone.
  expect(
    cloudRunnerOrigin("https://023e2f2a.fluxstudio.pages.dev", trusted),
  ).toBe("https://023e2f2a.fluxstudio.pages.dev");
  for (const url of [
    "https://attacker.pages.dev",
    "https://fluxstudio-copy.pages.dev",
    "https://genobi.workers.dev",
    "https://a.b.fluxstudio.pages.dev",
    "https://evilfluxstudio.pages.dev",
  ])
    expect(() => cloudRunnerOrigin(url, trusted), url).toThrow(
      "GENOBI_HOSTED_ORIGINS",
    );
  expect(hostedOrigins("")).toEqual(DEFAULT_HOSTED_ORIGINS);
  expect(DEFAULT_HOSTED_ORIGINS[0]).toBe("https://genobi.pages.dev");
  expect(DEFAULT_HOSTED_ORIGINS).toEqual(["https://genobi.pages.dev"]);
  expect(() => cloudRunnerOrigin("https://fluxstudio.pages.dev")).toThrow(
    "GENOBI_HOSTED_ORIGINS",
  );
  expect(
    cloudRunnerOrigin(
      "https://1a2b3c4d.genobi.pages.dev",
      DEFAULT_HOSTED_ORIGINS,
    ),
  ).toBe("https://1a2b3c4d.genobi.pages.dev");
  expect(hostedOrigins(" https://a.example , https://b.example ")).toEqual([
    "https://a.example",
    "https://b.example",
  ]);
});

it("a stop for a session that is already gone does not block the next launch", async () => {
  const f = await fixture();
  await f.connect();
  await f.runner.tick();
  const first = crypto.randomUUID();
  await f.store.start("host-owner", first, { prompt: "One", source: "typed" });
  await f.runner.tick();
  await f.store.stop("host-owner", first);
  // The local session leaves memory, as after a restart or eviction.
  f.sessions.clear();
  const second = crypto.randomUUID();
  await f.runner.tick();
  await f.store.start("host-owner", second, { prompt: "Two", source: "typed" });
  await f.runner.tick();
  await f.runner.tick();
  expect(f.agents.start).toHaveBeenCalledTimes(2);
  expect(f.runner.status("local-owner").message ?? "").not.toContain(
    "unavailable",
  );
});

it("clamps long progress so one line cannot stall the relay", async () => {
  const f = await fixture();
  await f.connect();
  await f.runner.tick();
  const id = crypto.randomUUID();
  await f.store.start("host-owner", id, { prompt: "Long", source: "typed" });
  await f.runner.tick();
  const view = [...f.sessions.values()][0];
  view.lines = ["Connected: " + "x".repeat(900)];
  view.summary = "y".repeat(5000);
  await f.runner.tick();
  const read = await f.store.read("host-owner", id);
  expect(read.lines.at(-1)!.length).toBeLessThanOrEqual(300);
  expect(read.summary!.length).toBeLessThanOrEqual(2000);
  expect(f.runner.status("local-owner").message ?? "").not.toContain(
    "unavailable",
  );
});
