// The agent session routes on the local server, run by a fake Claude Code
// that prints stream-JSON: the cross-site guard, ownership, one session per
// owner, the project link code, and Stop reaching only its own process.
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Project } from "../shared/director/types";
import { base } from "./house-template-fixtures";
import { describe, expect, it, vi } from "vitest";
import { AgentSessions } from "../server/agent-sessions";
import { agentStudio, alive, fakeConfig } from "./agent-harness";

describe("agent sessions", () => {
  it("runs the fake runner to a summary and its progress lines", async () => {
    const studio = await agentStudio();
    const cookie = await studio.fresh();
    const started = await studio.start(cookie, "Check the studio");
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({
      runner: "claude",
      status: "starting",
      prompt: "Check the studio",
    });
    const done = await studio.settle(cookie, started.body.id);
    expect(done.status).toBe("done");
    expect(done.summary).toBe("The studio is up.\n\nNothing was spent.");
    expect(done.lines).toEqual([
      "Starting Claude Code…",
      "Connected: genobi.",
      "Could not start: browser.",
      "Checking the studio.",
      "Using genobi_status",
    ]);
  });

  it("ends as waiting when a paid step was refused, and as failed on an error", async () => {
    const studio = await agentStudio();
    const a = await studio.fresh();
    const b = await studio.fresh();
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
  });

  it("refuses requests without the studio's header or from another origin", async () => {
    const studio = await agentStudio();
    const cookie = await studio.fresh();
    const cases = [
      { "X-Genobi-Agent": "" },
      { "X-Genobi-Agent": "yes" },
      { Origin: "http://evil.example" },
      { "Sec-Fetch-Site": "cross-site" },
      { "Sec-Fetch-Site": "same-site" },
    ];
    for (const headers of cases) {
      const reply = await studio.call(cookie, "/sessions", {
        method: "POST",
        body: { prompt: "Hi", source: "typed" },
        headers,
      });
      expect(reply.status).toBe(403);
    }
    const bare = await fetch(`${studio.base}/api/agent/status`, {
      headers: { cookie },
    });
    expect(bare.status).toBe(403);
    expect((await bare.json()).code).toBe("agent_cross_site");
    const ok = await studio.call(cookie, "/status", {
      headers: { Origin: studio.base, "Sec-Fetch-Site": "same-origin" },
    });
    expect(ok).toEqual({
      status: 200,
      body: {
        available: true,
        runner: "claude",
        // macOS can open a Terminal session too (docs/agent-setup.md).
        ...(process.platform === "darwin" ? { terminal: true } : {}),
      },
    });
  });

  it("refuses a malformed request before anything starts", async () => {
    const studio = await agentStudio();
    const cookie = await studio.fresh();
    expect(await studio.start(cookie, "")).toMatchObject({
      status: 400,
      body: { code: "agent_request", error: "Say what you want done." },
    });
    const notJson = await fetch(`${studio.base}/api/agent/sessions`, {
      method: "POST",
      headers: {
        cookie,
        "X-Genobi-Agent": "1",
        "Content-Type": "application/json",
      },
      body: "{",
    });
    expect(notJson.status).toBe(400);
    // Nothing is running, so a valid request starts at once.
    expect((await studio.start(cookie, "Check")).status).toBe(201);
  });

  it("keeps one running session per owner and hides it from others", async () => {
    const studio = await agentStudio();
    const owner = await studio.fresh();
    const other = await studio.fresh();
    const first = await studio.start(owner, "hang here");
    expect(first.status).toBe(201);
    const second = await studio.start(owner, "hang again");
    // The refusal names the running session, so the studio can follow it.
    expect(second).toMatchObject({
      status: 409,
      body: { code: "agent_busy", sessionId: first.body.id },
    });
    // After a reload the owner's panel finds it again; nobody else's does.
    expect((await studio.call(owner, "/sessions")).body.session).toMatchObject({
      id: first.body.id,
    });
    expect((await studio.call(other, "/sessions")).body).toEqual({
      session: null,
    });
    for (const route of [`/sessions/${first.body.id}`]) {
      expect((await studio.call(other, route)).status).toBe(404);
      expect(
        (await studio.call(other, `${route}/stop`, { method: "POST" })).status,
      ).toBe(404);
    }
    expect((await studio.call(owner, "/sessions/not-a-uuid")).status).toBe(404);
    await studio.call(owner, `/sessions/${first.body.id}/stop`, {
      method: "POST",
    });
    expect((await studio.settle(owner, first.body.id)).status).toBe("stopped");
    expect((await studio.call(owner, "/sessions")).body).toEqual({
      session: null,
    });
    expect((await studio.start(owner, "Check again")).status).toBe(201);
  });

  it("stops only its own process group", async () => {
    const signals: [number, NodeJS.Signals][] = [];
    const studio = await agentStudio({
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
    expect(pidA).not.toBe(pidB);
    const stopped = await studio.call(a, `/sessions/${first.body.id}/stop`, {
      method: "POST",
    });
    expect(stopped.body.lines.at(-1)).toBe("Stopping…");
    expect((await studio.settle(a, first.body.id)).status).toBe("stopped");
    expect(signals).toEqual([[-pidA, "SIGTERM"]]);
    expect(alive(pidA)).toBe(false);
    expect(alive(pidB)).toBe(true);
    const { body } = await studio.call(b, `/sessions/${second.body.id}`);
    expect(body.status).toBe("running");
    await studio.call(b, `/sessions/${second.body.id}/stop`, {
      method: "POST",
    });
    expect((await studio.settle(b, second.body.id)).status).toBe("stopped");
    expect(alive(pidB)).toBe(false);
  });

  it("kills a child that outlives the runner's SIGTERM", async () => {
    const studio = await agentStudio({ graceMs: 200 });
    const cookie = await studio.fresh();
    const { body } = await studio.start(cookie, "hang stubborn");
    const child = Number(
      (await studio.waitFor(cookie, body.id, /^child (\d+)$/))[1],
    );
    await studio.waitFor(cookie, body.id, /^pid (\d+)$/);
    await studio.call(cookie, `/sessions/${body.id}/stop`, { method: "POST" });
    expect((await studio.settle(cookie, body.id)).status).toBe("stopped");
    for (let i = 0; i < 40 && alive(child); i++)
      await new Promise((r) => setTimeout(r, 50));
    expect(alive(child)).toBe(false);
  });

  it("kills what a runner leaves behind when it finishes on its own", async () => {
    const studio = await agentStudio({ graceMs: 200 });
    const cookie = await studio.fresh();
    const { body } = await studio.start(cookie, "stubborn");
    const child = Number(
      (await studio.waitFor(cookie, body.id, /^child (\d+)$/))[1],
    );
    expect((await studio.settle(cookie, body.id)).status).toBe("done");
    for (let i = 0; i < 40 && alive(child); i++)
      await new Promise((r) => setTimeout(r, 50));
    expect(alive(child)).toBe(false);
  });

  it("waits for a stubborn child before shutdown resolves", async () => {
    const studio = await agentStudio({ graceMs: 200 });
    const cookie = await studio.fresh();
    const { body } = await studio.start(cookie, "hang stubborn");
    const child = Number(
      (await studio.waitFor(cookie, body.id, /^child (\d+)$/))[1],
    );
    await studio.waitFor(cookie, body.id, /^pid (\d+)$/);
    await studio.agents.close();
    expect(alive(child)).toBe(false);
  });

  it("stops a session that runs past its time", async () => {
    const studio = await agentStudio({
      config: await fakeConfig({ timeoutMs: 300 }),
    });
    const cookie = await studio.fresh();
    const { body } = await studio.start(cookie, "hang forever");
    const ended = await studio.settle(cookie, body.id);
    expect(ended.status).toBe("failed");
    expect(ended.summary).toMatch(/ran past/);
  });

  it("answers 503 when no runner is set up, and spawns nothing", async () => {
    const studio = await agentStudio({
      config: await fakeConfig({ runner: undefined }),
    });
    const cookie = await studio.fresh();
    const reply = await studio.start(cookie, "Hi");
    expect(reply).toMatchObject({
      status: 503,
      body: { code: "agent_unavailable" },
    });
  });
});

describe("the project link", () => {
  it("mints a link code for the owner's copy and hands it to the agent", async () => {
    const link = vi.fn(() => ({ code: "LINK2345" }));
    const plans: string[][] = [];
    let exit = () => {};
    const sessions = new AgentSessions({
      config: await fakeConfig(),
      studioOrigin: "http://127.0.0.1:4431",
      link,
      launch: (plan, on) => {
        plans.push(plan.args);
        exit = () => on.exit(0);
        return { pid: undefined };
      },
    });
    await sessions.start("owner-session", {
      prompt: "Punch in on the drop",
      source: "voice",
      copyId: "house-template",
    });
    expect(link).toHaveBeenCalledWith("house-template", "owner-session");
    const brief = plans[0][plans[0].indexOf("--append-system-prompt") + 1];
    expect(brief).toContain("`LINK2345`");
    // The scratch folder goes when the run ends.
    const file = plans[0][plans[0].indexOf("--mcp-config") + 1];
    expect(existsSync(file)).toBe(true);
    exit();
    await vi.waitFor(() => expect(existsSync(path.dirname(file))).toBe(false));
  });

  it("starts on the owner's project by id or handle, never a linked one", async () => {
    const studio = await agentStudio();
    const owner = await studio.fresh();
    const other = await studio.fresh();
    const bundle = base();
    const project = bundle.project as Project;
    const api = (cookie: string, route: string, init: RequestInit = {}) =>
      fetch(`${studio.base}/api/projects${route}`, {
        ...init,
        headers: { cookie, "Content-Type": "application/json" },
      });
    for (const bytes of new Set(bundle.files.values())) {
      const sha = createHash("sha256").update(bytes).digest("hex");
      await fetch(`${studio.base}/api/projects/${project.id}/files/${sha}`, {
        method: "PUT",
        headers: { cookie: owner, "Content-Type": "application/octet-stream" },
        body: bytes,
      });
    }
    const pushed = await api(owner, `/${project.id}`, {
      method: "PUT",
      body: JSON.stringify({
        baseRevision: null,
        project: { ...project, revision: 1 },
        brief: null,
      }),
    });
    expect(pushed.status).toBe(200);
    const { code } = await (
      await api(owner, `/${project.id}/link`, { method: "POST" })
    ).json();
    const linked = await (
      await api(other, "/link", {
        method: "POST",
        body: JSON.stringify({ code }),
      })
    ).json();
    const handle = linked.project.copyId as string;
    for (const copyId of [project.id, handle]) {
      const reply = await studio.start(owner, "Check the cut", { copyId });
      expect(reply.status).toBe(201);
      await studio.settle(owner, reply.body.id);
    }
    expect(
      (await studio.start(other, "Check the cut", { copyId: handle })).status,
    ).toBe(404);
  });

  it("stops a session even when the paid-write ceiling is used up", async () => {
    const studio = await agentStudio();
    const cookie = await studio.fresh();
    const { body } = await studio.start(cookie, "hang");
    await studio.waitFor(cookie, body.id, /^pid (\d+)$/);
    let refused = 0;
    for (let i = 0; i < 12 && !refused; i++)
      if ((await studio.start(cookie, "hang again")).status === 429) refused++;
    expect(refused).toBe(1);
    const stopped = await studio.call(cookie, `/sessions/${body.id}/stop`, {
      method: "POST",
    });
    expect(stopped.status).toBe(200);
    expect((await studio.settle(cookie, body.id)).status).toBe("stopped");
  });

  it("launches nothing once shutdown has begun, even mid-start", async () => {
    const launched = vi.fn(() => ({ pid: undefined }));
    const sessions = new AgentSessions({
      config: await fakeConfig(),
      studioOrigin: "http://127.0.0.1:4431",
      link: () => ({ code: "LINK2345" }),
      launch: launched,
    });
    const pending = sessions.start("owner-session", {
      prompt: "Punch in on the drop",
      source: "voice",
    });
    await sessions.close();
    await pending.catch(() => {});
    expect(launched).not.toHaveBeenCalled();
    await expect(
      sessions.start("owner-session", { prompt: "Again", source: "typed" }),
    ).rejects.toThrow(/shutting down/);
  });

  it("refuses a copy the owner does not hold, before spawning", async () => {
    const studio = await agentStudio();
    const cookie = await studio.fresh();
    const reply = await studio.start(cookie, "Edit it", {
      copyId: "someone-elses",
    });
    expect(reply.status).toBe(404);
    const { body } = await studio.call(cookie, "/status");
    expect(body.available).toBe(true);
    // Nothing was kept, so a new session starts at once.
    expect((await studio.start(cookie, "Check")).status).toBe(201);
  });
});
