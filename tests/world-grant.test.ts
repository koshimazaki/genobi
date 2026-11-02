// The World tab's grant to the studio's own agent session (docs/world-live.md,
// "Spoken control"): only the tab's owner, from its browser, may grant one of
// their running sessions; the grant reaches that run only, and disconnect,
// expiry or the run ending revoke it. The one-use code still works beside it.
import { afterEach, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { worldRouter } from "../server/world-routes";

const RUN = "11111111-1111-4111-8111-111111111111";
const OTHER_RUN = "22222222-2222-4222-8222-222222222222";
const STRANGER_RUN = "33333333-3333-4333-8333-333333333333";

let server: Server;
afterEach(() => {
  server?.close();
  vi.restoreAllMocks();
});

interface Caller {
  /** The request's own studio session (an agent's MCP cookie for an agent). */
  session?: string;
  /** The run an agent request speaks for, as `scopeAgentRequest` sets it. */
  run?: string;
  /** That run's owner. */
  runOwner?: string;
  /** Marked as an agent with no live scope (an ended run). */
  agent?: boolean;
}

async function harness(running: Map<string, string>) {
  const app = express();
  app.use((req, res, next) => {
    const caller = JSON.parse(String(req.headers["x-test"] ?? "{}")) as Caller;
    res.locals.sessionId = caller.session ?? "owner";
    res.locals.agent = !!(caller.agent || caller.run);
    // As the server: an ended run has no scope.
    if (caller.run && running.get(caller.run) === caller.runOwner)
      res.locals.agentScope = {
        owner: caller.runOwner,
        agentSession: caller.run,
        readable: new Set(),
      };
    next();
  });
  app.use(
    "/api/world",
    worldRouter({ ownsRun: (run, owner) => running.get(run) === owner }),
  );
  app.use(
    (
      error: { status?: number; message: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(error.status ?? 500).json({ error: error.message }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const port = (server.address() as { port: number }).port;
  return (path: string, caller: Caller = {}, method = "GET", body?: unknown) =>
    fetch(`http://127.0.0.1:${port}/api/world${path}`, {
      method,
      headers: {
        "x-test": JSON.stringify(caller),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

const agentOf = (run: string, runOwner = "owner"): Caller => ({
  session: `mcp-${run}`,
  run,
  runOwner,
});

it("lets only the tab's owner grant their own running session, for that run only", async () => {
  const running = new Map([
    [RUN, "owner"],
    [OTHER_RUN, "owner"],
    [STRANGER_RUN, "stranger"],
  ]);
  const call = await harness(running);
  const { id, code } = await (await call("/connect", {}, "POST", {})).json();
  // Before any grant, the run cannot reach the tab or find it.
  expect((await call(`/${id}/files`, agentOf(RUN))).status).toBe(404);
  expect((await call("/granted", agentOf(RUN))).status).toBe(404);
  // An agent cannot grant itself, even its own owner's run.
  expect(
    (await call(`/${id}/grant`, agentOf(RUN), "POST", { run: RUN })).status,
  ).toBe(404);
  // Another person cannot grant on this tab.
  expect(
    (
      await call(`/${id}/grant`, { session: "stranger" }, "POST", {
        run: STRANGER_RUN,
      })
    ).status,
  ).toBe(404);
  // The owner cannot grant someone else's run, nor a malformed id.
  expect(
    (await call(`/${id}/grant`, {}, "POST", { run: STRANGER_RUN })).status,
  ).toBe(404);
  expect(
    (await call(`/${id}/grant`, {}, "POST", { run: "not-a-run" })).status,
  ).toBe(400);
  expect((await call(`/${id}/grant`, {}, "POST", { run: RUN })).status).toBe(
    200,
  );
  // The granted run finds the tab and commands it; no code was used.
  expect(await (await call("/granted", agentOf(RUN))).json()).toEqual({ id });
  expect((await call(`/${id}/files`, agentOf(RUN))).status).toBe(200);
  const queued = await call(`/${id}/commands`, agentOf(RUN), "POST", {
    op: "status",
  });
  expect(queued.status).toBe(202);
  // Scoped to that run: another run of the same person is still refused,
  // as is a run claiming the owner while it belongs to someone else.
  expect((await call(`/${id}/files`, agentOf(OTHER_RUN))).status).toBe(404);
  expect((await call("/granted", agentOf(OTHER_RUN))).status).toBe(404);
  expect(
    (await call(`/${id}/files`, agentOf(STRANGER_RUN, "stranger"))).status,
  ).toBe(404);
  // A granted run is still not the tab's browser: no dispatch, no uploads.
  expect((await call(`/${id}/next`, agentOf(RUN))).status).toBe(404);
  expect(
    (await call(`/${id}/files/clip.webm`, agentOf(RUN), "POST", {})).status,
  ).toBe(404);
  expect((await call(`/${id}/files`, agentOf(RUN), "DELETE")).status).toBe(404);
  expect((await call(`/${id}`, agentOf(RUN), "DELETE")).status).toBe(404);
  // The one-use code keeps working beside the grant.
  const terminal: Caller = { session: "terminal", agent: true };
  expect((await call("/link", terminal, "POST", { code })).status).toBe(200);
  expect((await call(`/${id}/files`, terminal)).status).toBe(200);
});

it("revokes the grant when the run ends, on disconnect and on expiry", async () => {
  const running = new Map([[RUN, "owner"]]);
  const call = await harness(running);
  let { id } = await (await call("/connect", {}, "POST", {})).json();
  await call(`/${id}/grant`, {}, "POST", { run: RUN });
  expect((await call(`/${id}/files`, agentOf(RUN))).status).toBe(200);
  // The run ends: its scope is gone, so the grant reaches nothing.
  running.delete(RUN);
  expect((await call(`/${id}/files`, agentOf(RUN))).status).toBe(404);
  expect((await call(`/${id}/grant`, {}, "POST", { run: RUN })).status).toBe(
    404,
  );
  // Disconnect ends the tab's session and every grant with it.
  running.set(RUN, "owner");
  await call(`/${id}/grant`, {}, "POST", { run: RUN });
  await call(`/${id}`, {}, "DELETE");
  expect((await call(`/${id}/files`, agentOf(RUN))).status).toBe(404);
  expect((await call("/granted", agentOf(RUN))).status).toBe(404);
  // Expiry: a tab unseen for five minutes is swept, its grants too.
  ({ id } = await (await call("/connect", {}, "POST", {})).json());
  await call(`/${id}/grant`, {}, "POST", { run: RUN });
  expect((await call("/granted", agentOf(RUN))).status).toBe(200);
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 301_000);
  expect((await call("/granted", agentOf(RUN))).status).toBe(404);
  expect((await call(`/${id}/files`, agentOf(RUN))).status).toBe(404);
});

it("keeps another World view's session when the automatic link connects", async () => {
  const running = new Map([[RUN, "owner"]]);
  const call = await harness(running);
  const first = (await (await call("/connect", {}, "POST", {})).json()).id;
  await call(`/${first}/grant`, {}, "POST", { run: RUN });
  // A second view (or a remount) links automatically with keep.
  const second = (
    await (await call("/connect", {}, "POST", { keep: true })).json()
  ).id;
  expect(second).not.toBe(first);
  expect((await call(`/${first}/next`)).status).toBe(200);
  expect((await call(`/${first}/files`, agentOf(RUN))).status).toBe(200);
  expect(await (await call("/granted", agentOf(RUN))).json()).toEqual({
    id: first,
  });
  // Both grant the run: the latest grant is the one handed out.
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 1_000);
  await call(`/${second}/grant`, {}, "POST", { run: RUN });
  expect(await (await call("/granted", agentOf(RUN))).json()).toEqual({
    id: second,
  });
  // Connect agents, explicitly, still replaces the owner's other sessions.
  await call("/connect", {}, "POST", {});
  expect((await call(`/${first}/next`)).status).toBe(404);
  expect((await call(`/${second}/next`)).status).toBe(404);
});
