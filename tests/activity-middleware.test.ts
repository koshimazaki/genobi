import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { expect, it, vi } from "vitest";
import { activityMiddleware } from "../server/activity-middleware";
import type { ActivityStore } from "../server/activity";
import type { MemoryProjects } from "../server/memory-projects";
import type { Store } from "../server/store";

async function fixture(path = "/jobs") {
  const observe = vi.fn().mockResolvedValue(undefined);
  const middleware = activityMiddleware(
    { observe } as unknown as ActivityStore,
    {} as MemoryProjects,
    {
      data: {
        jobs: [
          {
            id: "job",
            sessionId: "owner",
            take: { recipe: { route: "router" } },
          },
        ],
      },
    } as unknown as Store,
  );
  const res = Object.assign(new EventEmitter(), {
    locals: { sessionId: "owner" },
    statusCode: 200,
    json: vi.fn(),
  });
  const next = vi.fn();
  await middleware(
    { method: "POST", path } as Request,
    res as unknown as Response,
    next,
  );
  return { observe, res, next };
}

it("observes accepted submission and actual route without copying response details", async () => {
  const { observe, res, next } = await fixture();
  expect(next).toHaveBeenCalledOnce();
  res.json({
    job: {
      id: "job",
      status: "Pending",
      prompt: "private",
      providerId: "secret",
    },
  });
  res.emit("finish");
  res.emit("close");
  expect(observe).toHaveBeenCalledTimes(2);
  expect(observe.mock.lastCall![1]).toMatchObject({
    tool: "generation-submit",
    phase: "succeeded",
    backend: "router",
  });
  expect(JSON.stringify(observe.mock.calls)).not.toMatch(
    /private|secret|providerId|prompt/,
  );
});

it("records job errors even in an HTTP 200 response", async () => {
  const { observe, res } = await fixture();
  res.json({ job: { id: "job", status: "Error" } });
  res.emit("finish");
  expect(observe.mock.lastCall![1].phase).toBe("failed");
});

it("observes approved agent submissions, keeping interrupted outcomes unknown", async () => {
  const { observe, res } = await fixture(
    "/agent/sessions/session/approvals/quote/approve",
  );
  res.emit("close");
  expect(observe.mock.lastCall![1]).toMatchObject({
    tool: "generation-submit",
    phase: "unknown",
  });
});
