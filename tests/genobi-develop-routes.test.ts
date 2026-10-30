import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DevelopmentSessions } from "../server/development-sessions";
import { developmentRouter } from "../server/development-routes";
import type { DevelopmentRunner } from "../shared/development-session";
import type {
  launch,
  LaunchPlan,
  RunnerHandlers,
} from "../server/agent-runner";
import { AGENT_REQUEST_HEADER } from "../shared/agent-session-events";
import { ServerRestart } from "../server/server-restart";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/**
 * The development router behind a stand-in for app.ts's /api middleware:
 * `x-test-agent` marks the request as an agent's, `x-test-scope` gives it the
 * scope a running studio-started session's grant resolves to.
 */
async function studio(runner: DevelopmentRunner | null) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "genobi-develop-"));
  const plans: LaunchPlan[] = [];
  const handlers: RunnerHandlers[] = [];
  const git: string[][] = [];
  const sessions = new DevelopmentSessions(directory, {
    binary: async () => "/test/runner",
    developerProfile: async () => true,
    git: async (args) => {
      git.push(args);
      return args[0] === "rev-parse" ? `${"a".repeat(40)}\n` : "";
    },
    launch: ((plan, on) => {
      plans.push(plan);
      handlers.push(on);
      return {} as ReturnType<typeof launch>;
    }) as typeof launch,
  });
  const app = express();
  app.use((request, response, next) => {
    response.locals.sessionId = String(
      request.headers["x-test-session"] ?? "person",
    );
    response.locals.agent = request.headers["x-test-agent"] === "1";
    if (request.headers["x-test-scope"])
      response.locals.agentScope = {
        owner: "person",
        agentSession: String(request.headers["x-test-scope"]),
        readable: new Set(),
      };
    next();
  });
  app.use(
    "/api/development",
    developmentRouter(sessions, () => {}, undefined, new ServerRestart(), {
      runner: () => runner ?? undefined,
    }),
  );
  app.use(
    (
      error: { status?: number; message: string; code?: string },
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      response
        .status(error.status ?? 500)
        .json({ error: error.message, code: error.code });
    },
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/development`;
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  cleanups.push(() => sessions.close());
  cleanups.push(() => new Promise((resolve) => server.close(resolve)));
  const agent = {
    "x-test-agent": "1",
    "x-test-scope": "agent-1",
    "x-test-session": "mcp",
  };
  const call = (
    route: string,
    headers: Record<string, string>,
    body?: unknown,
  ) =>
    fetch(`${base}${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { call, agent, plans, handlers, git, sessions };
}
const task = {
  role: "developer",
  task: "Move the mic icon from recording to the other side",
  mode: "change",
};

describe("A creative Genobi session starts a Developer", () => {
  it("starts one with the saved runner in a worktree from origin/main, for the person", async () => {
    const s = await studio("claude");
    const started = await s.call("/agent", s.agent, {
      ...task,
      files: ["src/voice/VoiceOverlay.tsx"],
    });
    expect(started.status).toBe(201);
    const receipt = await started.json();
    expect(receipt).toMatchObject({
      runner: "claude",
      status: "starting",
      mode: "change",
      base: "a".repeat(40),
      prUrl: null,
    });
    expect(receipt.branch).toMatch(
      /^genobi\/develop-move-the-mic-icon[a-z-]*-[0-9a-f]{8}$/,
    );
    expect(receipt.worktree).toMatch(
      /\.claude\/worktrees\/genobi-develop-[0-9a-f]{8}$/,
    );
    expect(s.git[0]).toEqual(["fetch", "origin", "main"]);
    expect(s.git[1]).toEqual([
      "worktree",
      "add",
      "-b",
      receipt.branch,
      receipt.worktree,
      "origin/main",
    ]);
    const plan = s.plans[0];
    expect(plan.cwd).toBe(receipt.worktree);
    expect(plan.env.GENOBI_AGENT_SESSION).toBe("1");
    expect(plan.stdin).toContain(
      "Move the mic icon from recording to the other side",
    );
    expect(plan.stdin).toContain("Do not commit.");
    expect(plan.args.join(" ")).not.toMatch(
      /git push|gh pr|bypass|dangerously/,
    );
    // The person sees it in Development, started by Genobi.
    const mine = await (
      await s.call("", { [AGENT_REQUEST_HEADER]: "1" })
    ).json();
    expect(mine.sessions[0].startedBy).toEqual({
      by: "genobi",
      agentSession: "agent-1",
    });
    // The creative session reads it back; another agent session cannot.
    const read = await s.call(`/agent/${receipt.id}`, s.agent);
    expect((await read.json()).branch).toBe(receipt.branch);
    expect(
      (
        await s.call(`/agent/${receipt.id}`, {
          ...s.agent,
          "x-test-scope": "agent-2",
        })
      ).status,
    ).toBe(404);
  });

  it("keeps the commit, push and pull request to pr mode, on the task branch only", async () => {
    const s = await studio("claude");
    const receipt = await (
      await s.call("/agent", s.agent, { ...task, mode: "pr" })
    ).json();
    const args = s.plans[0].args.join(" ");
    expect(args).toContain(`Bash(git push -u origin ${receipt.branch})`);
    expect(args).toContain("Bash(gh pr create *)");
    expect(args).not.toContain("Bash(git push *)");
    expect(s.plans[0].stdin).toContain("gh pr create --base main");
    s.handlers[0].line(
      JSON.stringify({
        type: "result",
        session_id: "native-session-1",
        result:
          "Opened https://github.com/example/studio/pull/999 with the change.",
      }),
    );
    const read = await (await s.call(`/agent/${receipt.id}`, s.agent)).json();
    expect(read.prUrl).toBe("https://github.com/example/studio/pull/999");
  });

  it("runs a Hermes Developer in its hermes-developer profile", async () => {
    const s = await studio("hermes");
    await s.call("/agent", s.agent, task);
    expect(s.plans[0].args.slice(0, 3)).toEqual([
      "-p",
      "hermes-developer",
      "chat",
    ]);
  });

  it("refuses a second Developer, a runner from the agent, bad bounds and no saved runner", async () => {
    const s = await studio("codex");
    expect((await s.call("/agent", s.agent, task)).status).toBe(201);
    const busy = await s.call("/agent", s.agent, task);
    expect(busy.status).toBe(409);
    expect((await busy.json()).code).toBe("development_busy");
    for (const body of [
      { ...task, runner: "hermes" },
      { ...task, role: "creative" },
      { ...task, task: "x".repeat(4001) },
      { ...task, mode: "merge" },
      { ...task, files: ["../outside"] },
      { ...task, files: ["/etc/passwd"] },
      { ...task, files: Array.from({ length: 21 }, (_, i) => `f${i}.ts`) },
    ]) {
      const refused = await s.call("/agent", s.agent, body);
      expect(refused.status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
    const none = await studio(null);
    const unsaved = await none.call("/agent", none.agent, task);
    expect(unsaved.status).toBe(503);
    expect((await unsaved.json()).code).toBe("develop_runner");
    expect(none.plans).toEqual([]);
  });

  it("opens nothing else: no scope, the person, list, stop and terminals stay refused", async () => {
    const s = await studio("claude");
    // Agent-marked without a running session's grant (a terminal profile, the Developer itself).
    const unscoped = await s.call("/agent", { "x-test-agent": "1" }, task);
    expect(unscoped.status).toBe(403);
    expect((await unscoped.json()).code).toBe("agent_nested");
    // The person's own browser uses Development, not this route.
    const person = await s.call(
      "/agent",
      { [AGENT_REQUEST_HEADER]: "1" },
      task,
    );
    expect((await person.json()).code).toBe("develop_agent_only");
    const receipt = await (await s.call("/agent", s.agent, task)).json();
    const marked = { ...s.agent, [AGENT_REQUEST_HEADER]: "1" };
    for (const [route, body] of [
      ["", undefined],
      [`/${receipt.id}/stop`, {}],
      ["/terminal", undefined],
      ["/terminal", { runner: "claude" }],
      ["", { runner: "claude", mode: "fresh", prompt: "Hi" }],
      ["/server/restart", {}],
    ] as const) {
      const refused = await s.call(route, marked, body);
      expect(refused.status, route).toBe(403);
      expect((await refused.json()).code, route).toBe("agent_nested");
    }
    expect(s.plans).toHaveLength(1);
  });

  it("records a failed worktree without launching anything", async () => {
    const s = await studio("claude");
    (
      s.sessions as unknown as { deps: { git: () => Promise<string> } }
    ).deps.git = async () => {
      throw new Error("worktree exists");
    };
    expect((await s.call("/agent", s.agent, task)).status).toBe(500);
    expect(s.plans).toEqual([]);
    const mine = await (
      await s.call("", { [AGENT_REQUEST_HEADER]: "1" })
    ).json();
    expect(mine.sessions[0].status).toBe("failed");
  });
});
