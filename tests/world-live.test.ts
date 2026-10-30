import { afterEach, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { worldRouter } from "../server/world-routes";
import { creatureSlot } from "../src/scene3d/creature-slots";
import { walkPose } from "../src/world-builder/walk-motion";
import { worldControl } from "../shared/world-control";
let server: Server;
afterEach(() => server?.close());
it("preserves the original nine FBX slots and selects creature run/flip without missing-clip failures", () => {
  expect(
    [
      "Idle",
      "Walking",
      "Run",
      "Standard Run",
      "Flying",
      "Backflip",
      "Fireball",
      "Breathing Idle",
      "Ninja Idle",
    ].map((n) => creatureSlot(n + ".fbx")),
  ).toEqual([
    "idle",
    "walk",
    "run",
    "standard-run",
    "fly",
    "backflip",
    "spell",
    "breathing",
    "ninja",
  ]);
  const state = { moving: true, running: true, jumping: false };
  expect(walkPose("creature", "idle", state, new Set(["run"]))).toBe("run");
  expect(
    walkPose(
      "creature",
      "idle",
      { ...state, jumping: true },
      new Set(["backflip"]),
    ),
  ).toBe("backflip");
  expect(walkPose("pug", "idle", { ...state, jumping: true }, new Set())).toBe(
    "jump",
  );
  expect(walkPose("creature", "idle", state, new Set())).toBe("walk");
  expect(() => worldControl.parse({ move: [0, 100], seconds: 99 })).toThrow();
});
it("pairs once, isolates dispatch/results/files and never redelivers a running command", async () => {
  const app = express();
  app.use((req, res, next) => {
    res.locals.sessionId = req.headers["x-test-owner"] ?? "owner";
    res.locals.agent = req.headers["x-test-agent"] === "1";
    next();
  });
  app.use("/api/world", worldRouter());
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
  const call = (
    path: string,
    owner = "owner",
    method = "GET",
    body?: unknown,
  ) =>
    fetch(`http://127.0.0.1:${port}/api/world${path}`, {
      method,
      headers: { "x-test-owner": owner, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const { id, code } = await (
    await call("/connect", "owner", "POST", {})
  ).json();
  expect((await call(`/${id}/next`, "stranger")).status).toBe(404);
  expect((await call("/link", "agent", "POST", { code })).status).toBe(200);
  expect((await call("/link", "stranger", "POST", { code })).status).toBe(404);
  expect((await call(`/${id}/next`, "agent")).status).toBe(404);
  expect(
    (await call(`/${id}/commands`, "stranger", "POST", { op: "stop" })).status,
  ).toBe(404);
  const c = await (
    await call(`/${id}/commands`, "agent", "POST", {
      op: "control",
      input: { move: [0, 1], camera: "orbit", seconds: 2 },
    })
  ).json();
  expect((await (await call(`/${id}/next`)).json()).id).toBe(c.id);
  expect(await (await call(`/${id}/next`)).json()).toBeNull();
  expect(
    (await call(`/${id}/commands/${c.id}`, "agent", "POST", { state: "done" }))
      .status,
  ).toBe(404);
  expect(
    (
      await call(`/${id}/commands/${c.id}`, "owner", "POST", {
        state: "done",
        result: { ok: true },
      })
    ).status,
  ).toBe(200);
  expect(
    await (await call(`/${id}/commands/${c.id}`, "agent")).json(),
  ).toMatchObject({ state: "done", result: { ok: true } });
  expect((await call(`/${id}/commands/${c.id}`, "stranger")).status).toBe(404);
  expect(
    (await call(`/${id}/files/clip.webm`, "agent", "POST", {})).status,
  ).toBe(404);
  expect((await call(`/${id}`, "agent", "DELETE")).status).toBe(404);
  await call(`/${id}`, "owner", "DELETE");
  expect((await call(`/${id}/commands/${c.id}`, "agent")).status).toBe(404);
});
