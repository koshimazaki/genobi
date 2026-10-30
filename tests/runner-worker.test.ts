import { afterAll, beforeAll, expect, it } from "vitest";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { relayFixture } from "./runner-relay-fixture";
import { secret } from "../worker/runner-store";
let directory: string;
let worker: {
  fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
};
const f = relayFixture();
const owner = crypto.randomUUID();
const env = {
  DB: f.binding,
  ASSETS: { fetch: async () => new Response("static") },
};
const ctx = { waitUntil: () => {} };
const call = (
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  worker.fetch(
    new Request(`https://studio.pages.dev${path}`, {
      method,
      headers: {
        Cookie: `camera_session=${owner}`,
        "X-Genobi-Agent": "1",
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
    ctx,
  );
beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "genobi-relay-worker-"));
  const outfile = path.join(directory, "worker.mjs");
  await build({
    entryPoints: ["worker/index.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["node:*"],
    logLevel: "silent",
  });
  worker = (await import(/* @vite-ignore */ pathToFileURL(outfile).href))
    .default;
});
afterAll(async () => {
  f.db.close();
  await rm(directory, { recursive: true, force: true });
});
it("serves the full keyless pair→claim→launch→progress flow through the Worker entry point", async () => {
  const pairing = await call("/api/runner/pair", "POST");
  expect(pairing.status).toBe(200);
  expect(pairing.headers.get("cache-control")).toBe("no-store");
  const pair = await pairing.json(),
    token = secret();
  expect(
    (
      await call("/api/runner/claim", "POST", {
        ...pair,
        token,
        runner: "hermes",
        localOrigin: "http://127.0.0.1:4317",
      })
    ).status,
  ).toBe(200);
  const runnerHeaders = {
    Authorization: `Bearer ${token}`,
    "X-Genobi-Runner": pair.id,
  };
  await call("/api/runner/poll", "POST", { updates: [] }, runnerHeaders);
  const id = crypto.randomUUID();
  const started = await call(
    "/api/agent/sessions",
    "POST",
    { prompt: "Prepare a storyboard plan", source: "typed" },
    { "Idempotency-Key": id },
  );
  expect(started.status).toBe(200);
  const command = await (
    await call("/api/runner/poll", "POST", { updates: [] }, runnerHeaders)
  ).json();
  expect(command.command.id).toBe(id);
  await call(
    "/api/runner/poll",
    "POST",
    {
      updates: [
        {
          id,
          localId: crypto.randomUUID(),
          status: "done",
          lines: ["Plan ready"],
        },
      ],
    },
    runnerHeaders,
  );
  expect(await (await call(`/api/agent/sessions/${id}`)).json()).toMatchObject({
    status: "done",
    lines: ["Plan ready"],
  });
  const wrongOwner = await call(`/api/agent/sessions/${id}`, "GET", undefined, {
    Cookie: `camera_session=${crypto.randomUUID()}`,
  });
  expect(wrongOwner.status).toBe(404);
});
it("refuses cross-origin/cross-site control, marked agents and remote paid approvals", async () => {
  expect(
    (
      await call("/api/runner/pair", "POST", undefined, {
        Origin: "https://evil.test",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call("/api/runner/pair", "POST", undefined, {
        "Sec-Fetch-Site": "cross-site",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call("/api/runner/pair", "POST", undefined, {
        "X-Genobi-Agent-Session": "1",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call(
        `/api/agent/sessions/${crypto.randomUUID()}/approvals/quote/approve`,
        "POST",
      )
    ).status,
  ).toBe(404);
  // Existing paid routes still require a provider key.
  expect((await call("/api/jobs", "POST", {})).status).toBe(400);
});
