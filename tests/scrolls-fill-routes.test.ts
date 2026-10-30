import express from "express";
import type { Server } from "node:http";
import { afterEach, expect, it } from "vitest";
import { FILL_TTL_MS, scrollsFillRouter } from "../server/scrolls-fill-routes";
import { AppError } from "../server/errors";
import { sameCode } from "../server/pairing-code";
import type { RateBucket } from "../shared/limits";

// Scrolls' Describe the video hand-off: the person's tab gets a one-use code,
// the agent sends panels with it once, checked whole, and only the tab that
// asked collects them, once. Nothing here generates or spends.
let server: Server | undefined;
afterEach(() => server?.close());

type Limit = (bucket: RateBucket, id: string) => void;
async function open(now = () => Date.now(), limit: Limit = () => {}) {
  const app = express();
  app.use((req, res, next) => {
    res.locals.sessionId = req.headers["x-test-owner"] ?? "owner";
    res.locals.agent = req.headers["x-test-agent"] === "1";
    next();
  });
  app.use("/api/scrolls", scrollsFillRouter(limit, now));
  app.use(
    (
      error: { status?: number; message: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(error.status ?? 500).json({ error: error.message }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server!.once("listening", r));
  const port = (server.address() as { port: number }).port;
  return (
    path: string,
    { owner = "owner", agent = false, body }: Record<string, unknown> = {},
  ) =>
    fetch(`http://127.0.0.1:${port}/api/scrolls${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "x-test-owner": String(owner),
        "x-test-agent": agent ? "1" : "0",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}
const ask = { documentId: "scroll-1", cellIds: ["cell-1", "cell-2"] };
const panels = [
  { cellId: "cell-1", title: "Standoff", camera: "Locked" },
  { cellId: "cell-2", title: "Escape", prompt: "They run.\nThen leap." },
];

it("hands the panels to the tab that asked, once, by a one-use code", async () => {
  const call = await open();
  const { id, code } = await (await call("/fill", { body: ask })).json();
  expect(code).toMatch(/^[a-f0-9]{32}$/);
  expect(await (await call(`/fill/${id}`)).json()).toEqual({ panels: null });
  const sent = await call("/fill/panels", {
    owner: "agent-session",
    agent: true,
    body: { code, panels },
  });
  expect(await sent.json()).toEqual({ accepted: 2, documentId: "scroll-1" });
  // One use: the same code again changes nothing.
  expect(
    (
      await call("/fill/panels", {
        owner: "agent-session",
        agent: true,
        body: { code, panels: [{ cellId: "cell-1", title: "Other" }] },
      })
    ).status,
  ).toBe(404);
  // Neither another session nor the agent can read the person's request.
  expect((await call(`/fill/${id}`, { owner: "stranger" })).status).toBe(404);
  expect(
    (await call(`/fill/${id}`, { owner: "owner", agent: true })).status,
  ).toBe(404);
  expect(await (await call(`/fill/${id}`)).json()).toEqual({
    documentId: "scroll-1",
    panels,
  });
  expect((await call(`/fill/${id}`)).status).toBe(404);
});

it.each([
  [[{ cellId: "cell-9", title: "Not here" }], /does not have/],
  [
    [
      { cellId: "cell-1", title: "A" },
      { cellId: "cell-1", title: "B" },
    ],
    /once/,
  ],
  [[{ cellId: "cell-1", title: "Bell\x07" }], /control characters/],
  [[{ cellId: "cell-1", title: "Two\nlines" }], /one line/],
  [[{ cellId: "cell-1", title: "x".repeat(81) }], /at most 80/],
  [[{ cellId: "cell-1", cost: 1 }], /Unexpected/],
  [[{ cellId: "cell-1" }], /title, camera, action or prompt/],
  [[], /1 to 16/],
])("refuses %j whole and keeps the code usable", async (bad, message) => {
  const call = await open();
  const { id, code } = await (await call("/fill", { body: ask })).json();
  const refused = await call("/fill/panels", {
    agent: true,
    body: { code, panels: bad },
  });
  expect(refused.status).toBe(400);
  expect((await refused.json()).error).toMatch(message);
  expect(await (await call(`/fill/${id}`)).json()).toEqual({ panels: null });
  expect(
    (await call("/fill/panels", { agent: true, body: { code, panels } }))
      .status,
  ).toBe(200);
});

it("keeps one request per session, refuses agents asking and malformed asks", async () => {
  const call = await open();
  const first = await (await call("/fill", { body: ask })).json();
  const second = await (await call("/fill", { body: ask })).json();
  expect((await call(`/fill/${first.id}`)).status).toBe(404);
  expect(
    (
      await call("/fill/panels", {
        agent: true,
        body: { code: first.code, panels },
      })
    ).status,
  ).toBe(404);
  expect(await (await call(`/fill/${second.id}`)).json()).toEqual({
    panels: null,
  });
  expect((await call("/fill", { agent: true, body: ask })).status).toBe(403);
  for (const body of [
    { documentId: "Bad Id", cellIds: ["cell-1"] },
    { documentId: "scroll-1", cellIds: [] },
    { documentId: "scroll-1", cellIds: ["cell-1", "cell-1"] },
    { documentId: "scroll-1", cellIds: ["../x"] },
  ])
    expect((await call("/fill", { body })).status).toBe(400);
  expect(
    (
      await call("/fill/panels", {
        agent: true,
        body: { code: "nope", panels },
      })
    ).status,
  ).toBe(400);
});

it("forgets a request after its time", async () => {
  let clock = 1_000_000;
  const call = await open(() => clock);
  const { id, code } = await (await call("/fill", { body: ask })).json();
  clock += FILL_TTL_MS + 1;
  expect(
    (await call("/fill/panels", { agent: true, body: { code, panels } }))
      .status,
  ).toBe(404);
  expect((await call(`/fill/${id}`)).status).toBe(404);
});

it("the agent's tool posts the code and panels, and its schema refuses extras", async () => {
  const { z } = await import("zod");
  const { scrollsTools } = await import("../mcp/scrolls-tools");
  const tool = scrollsTools.find((t) => t.name === "genobi_scrolls_panels")!;
  const schema = z.object(tool.inputSchema).strict();
  const code = "0123456789abcdef0123456789abcdef";
  expect(schema.safeParse({ code, panels }).success).toBe(true);
  for (const bad of [
    { code: "nope", panels },
    { code, panels: [{ cellId: "cell-1", title: "A", cost: 1 }] },
    { code, panels: [{ cellId: "../x", title: "A" }] },
    { code, panels: [] },
  ])
    expect(schema.safeParse(bad).success).toBe(false);
  const post = async (path: string, body: unknown) => ({ path, body });
  expect(await tool.run({ post } as never, { code, panels })).toEqual({
    path: "/api/scrolls/fill/panels",
    body: { code, panels },
  });
  expect(tool.annotations.readOnlyHint).toBe(false);
  expect(tool.paid).toBeUndefined();
});

it("counts each route in the server's ceilings and refuses past them", async () => {
  const counted: string[] = [];
  let full = false;
  const call = await open(undefined, (bucket, id) => {
    counted.push(`${bucket} ${id}`);
    if (full)
      throw new AppError(429, "Please wait a moment before trying again.");
  });
  const { id, code } = await (await call("/fill", { body: ask })).json();
  await call(`/fill/${id}`);
  await call("/fill/panels", {
    owner: "agent-session",
    agent: true,
    body: { code, panels },
  });
  expect(counted).toEqual(["edit owner", "poll owner", "edit agent-session"]);
  full = true;
  expect((await call("/fill", { body: ask })).status).toBe(429);
});

it("compares pairing codes only when both are present and the same length", () => {
  const code = "0123456789abcdef0123456789abcdef";
  expect(sameCode(code, code)).toBe(true);
  expect(sameCode(code, code.replace(/f$/, "e"))).toBe(false);
  expect(sameCode(undefined, code)).toBe(false);
  expect(sameCode(code, code.slice(1))).toBe(false);
});
