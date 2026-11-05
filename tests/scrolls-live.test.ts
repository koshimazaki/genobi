import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { setup } from "./server-harness";
import { createScroll } from "../shared/scrolls/commands";
import {
  liveScrollEdit,
  scrollSnapshot,
  type ScrollSnapshot,
} from "../shared/scrolls/live";
import { GenobiApi } from "../mcp/api";
import { scrollsLiveTools } from "../mcp/scrolls-live-tools";
import { AGENT_MARK_HEADER } from "../shared/agent-session-events";

async function prepared() {
  const s = await setup();
  const fresh = async () =>
    (await fetch(`${s.base}/api/health`)).headers
      .get("set-cookie")!
      .split(";")[0];
  const agent = await fresh(),
    stranger = await fresh();
  const send = async (
    route: string,
    body?: unknown,
    cookie = s.cookie,
    marked = false,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const r = await fetch(`${s.base}/api/exports${route}`, {
      method,
      headers: {
        cookie,
        "Content-Type": "application/json",
        ...(marked ? { [AGENT_MARK_HEADER]: "1" } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, data: await r.json() };
  };
  const document = createScroll("storyboard", 2, "live-scroll"),
    source = { kind: "scrolls", id: document.id, revision: 0 };
  const snapshot = scrollSnapshot({
    document,
    context: { documentId: document.id, revision: 0, cellId: "cell-1" },
    availableAssetIds: [],
  });
  const {
    data: { tabId },
  } = await send("/tabs", source);
  await send(`/scrolls/tabs/${tabId}/poll`, snapshot);
  const {
    data: { code },
  } = await send(`/tabs/${tabId}/link`, source);
  const api = new GenobiApi(new URL(s.base), (url, init) =>
    fetch(url, { ...init, headers: { ...init?.headers, cookie: agent } }),
  );
  const tool = (args: Record<string, unknown>) =>
    scrollsLiveTools[0].run(api, args);
  await tool({ action: "link", code });
  const request = {
    requestId: randomUUID(),
    tabId,
    context: snapshot.context,
    command: { op: "brief", revision: 0, prompt: "Keep this creature." },
  };
  return {
    ...s,
    send,
    agent,
    stranger,
    tabId,
    snapshot,
    source,
    request,
    tool,
  };
}
it("inspects only the linked tab and applies a revision-bound command with replayable read-back", async () => {
  const s = await prepared();
  const second = (await s.send("/tabs", s.source)).data.tabId;
  const targets = (await s.tool({ action: "targets" })) as {
    targets: { tabId: string }[];
  };
  expect(targets.targets.map((t) => t.tabId)).toEqual([s.tabId]);
  await expect(s.tool({ action: "inspect", tabId: second })).rejects.toThrow(
    "not found",
  );
  expect(await s.tool({ action: "inspect", tabId: s.tabId })).toMatchObject(
    s.snapshot,
  );
  const job = (await s.tool({ action: "request", ...s.request })) as {
    id: string;
  };
  expect(
    (await s.send(`/scrolls/tabs/${s.tabId}/poll`, s.snapshot)).data.job.state,
  ).toBe("running");
  const document = liveScrollEdit(s.snapshot, s.request);
  const result = {
    ...s.snapshot,
    document,
    context: { ...s.snapshot.context, revision: 1 },
  };
  expect(
    (await s.send(`/scrolls/commands/${job.id}/result`, { snapshot: result }))
      .data,
  ).toMatchObject({ state: "done", result });
  expect(await s.tool({ action: "request", ...s.request })).toMatchObject({
    id: job.id,
    state: "done",
    result,
  });
  expect(
    (await s.send(`/scrolls/commands/${job.id}`, undefined, s.stranger)).status,
  ).toBe(404);
  await s.send(`/tabs/${s.tabId}`, undefined, s.cookie, false, "DELETE");
  expect(await s.tool({ action: "status", id: job.id })).toMatchObject({
    state: "done",
  });
  await expect(
    s.tool({
      action: "request",
      ...s.request,
      command: { ...s.request.command, prompt: "Changed replay" },
    }),
  ).rejects.toThrow("different Scroll command");
  expect(s.bfl.submissions).toBe(0);
});
it("refuses stale context, foreign tabs, metadata-only assets and agent browser dispatch", async () => {
  const s = await prepared();
  for (const context of [
    { ...s.snapshot.context, revision: 4 },
    { ...s.snapshot.context, documentId: "other" },
    { ...s.snapshot.context, cellId: "cell-2" },
  ]) {
    await expect(
      s.tool({ action: "request", ...s.request, context }),
    ).rejects.toThrow("changed");
  }
  await expect(
    s.tool({
      action: "request",
      ...s.request,
      command: { op: "add-asset", revision: 0 },
    }),
  ).rejects.toThrow("owned media");
  expect(
    (await s.send(`/scrolls/tabs/${s.tabId}/poll`, s.snapshot, s.agent)).status,
  ).toBe(404);
  expect(
    (await s.send(`/scrolls/tabs/${s.tabId}/poll`, s.snapshot, s.cookie, true))
      .status,
  ).toBe(403);
  const job = (await s.tool({ action: "request", ...s.request })) as {
    id: string;
  };
  expect(
    (
      await s.send(
        `/scrolls/commands/${job.id}/result`,
        { error: "Fake" },
        s.cookie,
        true,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await s.send(
        `/scrolls/commands/${job.id}/result`,
        { error: "Fake" },
        s.agent,
      )
    ).status,
  ).toBe(404);
  const changed: ScrollSnapshot = {
    ...s.snapshot,
    context: { ...s.snapshot.context, cellId: "cell-2" },
  };
  expect(
    (await s.send(`/scrolls/tabs/${s.tabId}/poll`, changed)).data.job,
  ).toMatchObject({
    state: "error",
    error: expect.stringContaining("changed before dispatch"),
  });
  expect(
    (
      await s.send(`/scrolls/tabs/${s.tabId}/poll`, {
        ...changed,
        document: { ...changed.document, id: "other" },
        context: { ...changed.context, documentId: "other" },
      })
    ).status,
  ).toBe(409);
});
it("reports uncertain dispatched edits after disconnect and never redispatches them", async () => {
  const s = await prepared();
  const job = (await s.tool({ action: "request", ...s.request })) as {
    id: string;
  };
  await s.send(`/scrolls/tabs/${s.tabId}/poll`, s.snapshot);
  await s.send(`/tabs/${s.tabId}`, undefined, s.cookie, false, "DELETE");
  expect(await s.tool({ action: "status", id: job.id })).toMatchObject({
    state: "error",
    error: expect.stringContaining("may have applied"),
  });
  expect(await s.tool({ action: "request", ...s.request })).toMatchObject({
    id: job.id,
    state: "error",
  });
});

it("keeps a newer human selection when an earlier result acknowledgement arrives", async () => {
  const s = await prepared();
  const job = (await s.tool({ action: "request", ...s.request })) as {
    id: string;
  };
  await s.send(`/scrolls/tabs/${s.tabId}/poll`, s.snapshot);
  const document = liveScrollEdit(s.snapshot, s.request);
  const result = {
    ...s.snapshot,
    document,
    context: { ...s.snapshot.context, revision: 1 },
  };
  const human = { ...result, context: { ...result.context, cellId: "cell-2" } };
  await s.send(`/scrolls/tabs/${s.tabId}/poll`, human);
  await s.send(`/scrolls/commands/${job.id}/result`, { snapshot: result });
  expect(await s.tool({ action: "inspect", tabId: s.tabId })).toMatchObject({
    context: human.context,
  });
  expect(await s.tool({ action: "status", id: job.id })).toMatchObject({
    state: "done",
    result,
  });
});
