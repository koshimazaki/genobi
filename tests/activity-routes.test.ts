import type { Request, Response } from "express";
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { activityRouter } from "../server/activity-routes";
import { ActivityStore } from "../server/activity";
import type { MemoryProjects } from "../server/memory-projects";
import type { Store } from "../server/store";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "genobi-activity-route-"));
  roots.push(root);
  const activity = new ActivityStore(root);
  const access = vi.fn((copy, session) => {
    if (copy !== "project.linked" || session !== "linked")
      throw new Error("Not owned");
    return { owner: "owner" };
  });
  const store = { data: { jobs: [] } } as unknown as Store;
  const limit = vi.fn();
  const router = activityRouter(
    activity,
    { access } as unknown as MemoryProjects,
    limit,
    store,
  );
  // Exercise actual route handlers without opening a socket; Express body/session parsing is unchanged.
  async function call(
    method: "get" | "post" | "put",
    sessionId: string,
    body?: unknown,
    extra: Record<string, unknown> = {},
  ) {
    const route = router.stack.find(
      (layer) =>
        (layer.route as unknown as { methods?: Record<string, boolean> })
          ?.methods?.[method],
    )!.route!;
    let answer: unknown;
    const response = {
      locals: { sessionId, ...extra },
      json: (value: unknown) => {
        answer = value;
      },
    };
    await route.stack
      .at(-1)!
      .handle(
        { body, headers: {} } as Request,
        response as unknown as Response,
        () => {},
      );
    return answer;
  }
  return { activity, access, store, call, router, limit };
}
const event = {
  id: "event",
  at: "2026-10-25T00:00:00Z",
  tool: "genobi_scene",
  phase: "succeeded",
  source: "mcp",
};
it("linked external harness activity uses the project owner opt-in, never an arbitrary owner ID", async () => {
  const f = await fixture();
  await f.activity.configure("owner", true);
  await f.call("post", "linked", {
    event,
    copyId: "project.linked",
    owner: "stranger",
  });
  expect((await f.activity.read("owner")).events).toHaveLength(1);
  expect((await f.activity.read("stranger")).events).toEqual([]);
  await expect(
    f.call("post", "stranger", { event, copyId: "project.linked" }),
  ).rejects.toThrow("Not owned");
});
it("a bound agent cannot read all owner activity or change the owner's preference", async () => {
  const f = await fixture();
  await f.activity.configure("owner", true);
  await f.activity.append("owner", {
    ...event,
    source: "mcp",
    phase: "succeeded",
  });
  expect(
    await f.call("get", "agent", undefined, { agentScope: { owner: "owner" } }),
  ).toMatchObject({ enabled: false, events: [] });
  await expect(
    f.call("put", "agent", { enabled: true }, { agent: true }),
  ).rejects.toThrow("Only the studio owner");
});
it("backend comes only from an authorized stored take, not client claims", async () => {
  const f = await fixture();
  await f.activity.configure("owner", true);
  f.store.data.jobs.push({
    id: "job",
    sessionId: "owner",
    take: { recipe: { route: "workflow", location: "local" } },
  } as never);
  await f.call("post", "owner", {
    event: { ...event, tool: "genobi_submit", backend: "router" },
    jobId: "job",
  });
  expect((await f.activity.read("owner")).events[0].backend).toBe("local");
  await f.call("post", "owner", {
    event: { ...event, id: "missing", backend: "router" },
    jobId: "not-owned",
  });
  expect(
    (await f.activity.read("owner")).events.find((e) => e.id === "missing")!
      .backend,
  ).toBeUndefined();
  await expect(
    f.call("post", "owner", { event: { ...event, source: "server" } }),
  ).rejects.toThrow("Unknown activity tool");
});
it("owner opt-out applies to external tools too, including a late completion", async () => {
  const f = await fixture();
  await f.activity.configure("owner", true);
  await f.call("post", "linked", {
    event: { ...event, phase: "started" },
    copyId: "project.linked",
  });
  await f.call("put", "owner", { enabled: false });
  expect(
    await f.call("post", "linked", { event, copyId: "project.linked" }),
  ).toEqual({ recorded: false });
  expect((await f.activity.read("owner")).events).toEqual([]);
});

it("keeps optional event traffic separate from generation history and preference writes", async () => {
  const f = await fixture();
  for (const method of ["POST", "GET", "PUT"])
    f.router.stack[0].handle(
      { method } as Request,
      { locals: { sessionId: "owner" } } as unknown as Response,
      () => {},
    );
  expect(f.limit.mock.calls.map(([bucket]) => bucket)).toEqual([
    "activity",
    "activity",
    "history",
  ]);
});
