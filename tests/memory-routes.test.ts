import { describe, expect, it } from "vitest";
import { studio } from "./project-copy-harness";
import { AGENT_MARK_HEADER } from "../shared/agent-session-events";
import { GenobiApi } from "../mcp/api";
import { memoryTools } from "../mcp/memory-tools";
import { z } from "zod";

async function setupMemory() {
  const h = await studio();
  await h.upload(h.cookie);
  await h.push(h.cookie, null, 1);
  const copyId =
    h.projects.list(h.cookie.slice(15))[0]?.copyId ??
    ((await h.send(h.cookie, "")).projects as { copyId: string }[])[0].copyId;
  const root = `projects/${copyId}`;
  const call = async (
    cookie: string,
    route: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const response = await fetch(`${h.base}/api/memory/${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie,
        "Content-Type": "application/json",
        "X-Genobi-Owner-Action": "1",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const context = async () => (await call(h.cookie, `${root}/context`)).body;
  return { ...h, copyId, root, call, context };
}

describe("memory HTTP ownership and user intent", () => {
  it("records a decision and only explicit owner actions can activate, edit or delete taste", async () => {
    const h = await setupMemory();
    const c = await h.context();
    const decision = {
      id: "keep",
      baseRevision: 1,
      memoryRevision: c.memoryRevision,
      kind: "preference",
      objectIds: [],
      source: "explicit-user",
      reason: "Use a slow orbit for tutorials",
      guidance: { topic: "camera", value: "slow orbit" },
    };
    expect(
      (await h.call(h.cookie, `${h.root}/decisions`, decision)).status,
    ).toBe(200);
    const profile = (await h.call(h.cookie, "taste")).body;
    const preference = {
      id: "taste-camera",
      topic: "camera",
      value: "slow orbit",
      scope: { medium: "video", useCase: "tutorial" },
      evidence: [{ copyId: h.copyId, eventId: "keep" }],
    };
    expect(
      (
        await h.call(h.cookie, `${h.root}/taste`, {
          revision: profile.revision,
          preference,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await h.call(
          h.cookie,
          "taste",
          { revision: 1, id: preference.id, action: "activate" },
          { [AGENT_MARK_HEADER]: "1" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await h.call(
          h.cookie,
          "taste",
          { revision: 1, id: preference.id, action: "activate" },
          { "X-Genobi-Owner-Action": "" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await h.call(
          h.cookie,
          "taste",
          { revision: 1, id: preference.id, action: "activate" },
          { "Sec-Fetch-Site": "cross-site" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await h.call(h.cookie, "taste", {
          revision: 1,
          id: preference.id,
          action: "activate",
        })
      ).status,
    ).toBe(200);
    const other = await h.fresh();
    expect((await h.call(other, `${h.root}/context`)).status).toBe(404);
    expect((await h.call(other, "taste")).body.preferences).toEqual([]);
    const before = await h.context();
    expect(
      (
        await h.call(h.cookie, `${h.root}/forget`, {
          revision: before.memoryRevision - 1,
          eventId: "keep",
        })
      ).status,
    ).toBe(409);
    expect((await h.call(h.cookie, "taste")).body.preferences).toHaveLength(1);
    expect(
      (
        await h.call(h.cookie, `${h.root}/forget`, {
          revision: before.memoryRevision,
          eventId: "keep",
        })
      ).status,
    ).toBe(200);
    expect((await h.call(h.cookie, "taste")).body.preferences).toEqual([]);
  });
  it("links an external MCP harness, records interpretations, checkpoints, and refuses forged human evidence", async () => {
    const h = await setupMemory();
    const api = new GenobiApi(new URL(h.base));
    const { code } = await h.send(h.cookie, `/${h.project.id}/link`, "POST");
    const linked = await api.post<{ project: { copyId: string } }>(
      "/api/projects/link",
      { code },
    );
    expect(linked.project.copyId).toBe(h.copyId);
    const tool = (name: string) => memoryTools.find((t) => t.name === name)!;
    const run = (name: string, args: Record<string, unknown>) =>
      tool(name).run(api, z.object(tool(name).inputSchema).parse(args));
    let c = (await run("genobi_context", { copyId: h.copyId })) as {
      memoryRevision: number;
      cursor: number;
    };
    expect(c.memoryRevision).toBeGreaterThan(0);
    await run("genobi_session_checkpoint", {
      copyId: h.copyId,
      action: "start",
      sessionId: "codex-session",
      runner: "codex",
      goal: "Review the tutorial",
    });
    c = (await run("genobi_context", { copyId: h.copyId })) as typeof c;
    const decision = {
      copyId: h.copyId,
      id: "agent-observation",
      baseRevision: 1,
      memoryRevision: c.memoryRevision,
      kind: "note",
      objectIds: [],
      source: "interpretation",
      reason: "An ending still needs review",
    };
    await run("genobi_decision", decision);
    c = (await run("genobi_context", { copyId: h.copyId })) as typeof c;
    await expect(
      run("genobi_decision", {
        ...decision,
        id: "fake-user",
        memoryRevision: c.memoryRevision,
        source: "explicit-user",
      }),
    ).rejects.toThrow();
    await run("genobi_session_checkpoint", {
      copyId: h.copyId,
      action: "checkpoint",
      checkpoint: {
        id: "checkpoint",
        baseRevision: 1,
        memoryRevision: c.memoryRevision,
        sessionId: "codex-session",
        coveredCursor: c.cursor,
        eventIds: ["agent-observation"],
        summary: "Review incomplete",
        unresolved: ["Ending"],
        nextSteps: ["Ask for review"],
        status: "stopped",
      },
    });
    const result = (await run("genobi_context", { copyId: h.copyId })) as {
      sessions: { status: string }[];
      checkpoint: { unresolved: string[] };
    };
    expect(result.sessions[0].status).toBe("stopped");
    expect(result.checkpoint.unresolved).toEqual(["Ending"]);
  });
});

it("memory writes use the edit bucket without consuming generation capacity", async () => {
  const h = await setupMemory();
  for (let i = 0; i < 12; i++) {
    const c = await h.context();
    expect(
      (
        await h.call(h.cookie, `${h.root}/decisions`, {
          id: `rate-${i}`,
          baseRevision: 1,
          memoryRevision: c.memoryRevision,
          kind: "note",
          objectIds: [],
          source: "explicit-user",
        })
      ).status,
    ).toBe(200);
  }
  // A thirteenth owner write remains possible; the submit bucket is 8/min.
  const c = await h.context();
  expect(
    (
      await h.call(h.cookie, `${h.root}/decisions`, {
        id: "last",
        baseRevision: 1,
        memoryRevision: c.memoryRevision,
        kind: "note",
        objectIds: [],
        source: "explicit-user",
      })
    ).status,
  ).toBe(200);
});

it("never includes browser session credentials in private memory exports", async () => {
  const h = await setupMemory();
  expect(
    (
      await h.call(h.cookie, `${h.root}/sessions`, {
        id: "export-session",
        runner: "codex",
        goal: "Review",
      })
    ).status,
  ).toBe(200);
  const exported = await h.call(h.cookie, `${h.root}/memory-export`);
  expect(exported.status).toBe(200);
  expect(exported.body.sessions[0].principal).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(exported.body)).not.toContain(h.cookie.split("=")[1]);
});
