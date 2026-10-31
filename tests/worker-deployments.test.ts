import { describe, expect, it } from "vitest";
import { call, mf, newSession, useWorker } from "./worker-harness";
import { deploymentRequests, deploymentFault } from "./worker-deploy-provider";
import { modelOptions } from "../src/components/GenerationControls";
import type { Job } from "../shared/types";
useWorker();
const key = "comfyui-deployment-test-key";
const endpoint = "https://caller-owned.run.comfy.app";
const headers = (session: string) => ({
  cookie: session,
  "content-type": "application/json",
  "x-byo-key": key,
});
const settings = (session: string, url = endpoint) =>
  call("/api/settings/run-location", {
    method: "POST",
    headers: { cookie: session, "content-type": "application/json" },
    body: JSON.stringify({ location: "deployment", deploymentUrl: url }),
  });
const input = {
  generator: "video",
  presetId: "orbit_l",
  upscaleFactor: 2,
  model: "ltx-deploy-layout-to-video",
  description: "A room.",
  duration: 8,
  resolution: "hd",
  aspectRatio: "16:9",
  draft: false,
  cameraEnabled: false,
  deploy: {
    seed: 0,
    negativePrompt: "",
    recipe: JSON.stringify({
      version: 1,
      fps: 24,
      width: 1024,
      height: 576,
      frames: 193,
    }),
    assets: {} as Record<string, string>,
  },
};
async function staged(session: string) {
  expect((await settings(session)).status).toBe(200);
  const db = await mf.getD1Database("DB");
  const assets: Record<string, string> = {};
  for (const token of ["TAKE_WEBM", "REFERENCE_PNG", "TRACK_AUDIO"]) {
    const id = crypto.randomUUID();
    assets[token] = id;
    await db
      .prepare(
        "INSERT INTO deployment_assets(id,session,url,token,reference,expires) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        id,
        session.slice(15),
        endpoint,
        token,
        JSON.stringify({
          __type: "core/ASSET",
          info: { id: `fixture-${token}` },
        }),
        Date.now() + 7200000,
      )
      .run();
  }
  return { ...input, deploy: { ...input.deploy, assets } };
}
async function quoted(session: string, body: object) {
  const r = await call("/api/quotes", {
    method: "POST",
    headers: headers(session),
    body: JSON.stringify(body),
  });
  const data = (await r.json()) as {
    quote: { id: string; billing: string; recipe: unknown };
  };
  expect(r.status, JSON.stringify(data)).toBe(201);
  return data.quote;
}
function submit(
  session: string,
  body: object,
  quote?: string,
  id = crypto.randomUUID(),
) {
  return call("/api/jobs", {
    method: "POST",
    headers: {
      ...headers(session),
      "idempotency-key": id,
      ...(quote ? { "quote-id": quote } : {}),
    },
    body: JSON.stringify(body),
  });
}
describe("hosted caller-owned Comfy deployments", () => {
  it("shows setup-required models and keeps ordinary Comfy generations available", () => {
    const options = modelOptions("ltx", false, true);
    const deployed = options.filter((o) => o.value.startsWith("ltx-deploy-"));
    expect(deployed).toHaveLength(2);
    expect(
      deployed.every((o) => o.disabled && o.tag === "setup required"),
    ).toBe(true);
    expect(options.some((o) => o.value === "ltx-2-5-fast" && !o.disabled)).toBe(
      true,
    );
  });
  it("saves unpaid settings without a key, isolates sessions and refuses foreign hosts", async () => {
    const session = newSession();
    expect((await settings(session)).status).toBe(200);
    const state = await (
      await call("/api/settings/run-location", { headers: { cookie: session } })
    ).json();
    expect(state).toMatchObject({
      fixed: false,
      location: "deployment",
      deployment: { url: endpoint },
      revision: 1,
    });
    const other = await (
      await call("/api/settings/run-location", {
        headers: { cookie: newSession() },
      })
    ).json();
    expect(other).not.toHaveProperty("deployment");
    for (const url of [
      "https://evil.test",
      "http://localhost:8188",
      "https://caller-owned.run.comfy.app/path",
      "https://user:secret@caller-owned.run.comfy.app",
    ])
      expect((await settings(newSession(), url)).status).toBe(400);
    expect(deploymentRequests).toHaveLength(0);
  });
  it("uploads through the real SDK with a transient caller key and stores only an owned receipt", async () => {
    const session = newSession();
    await settings(session);
    const response = await call("/api/settings/deployment-assets/TAKE_WEBM", {
      method: "POST",
      headers: {
        cookie: session,
        "x-byo-key": key,
        "content-type": "video/webm",
      },
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]),
    });
    const data = (await response.json()) as { id: string };
    expect(response.status, JSON.stringify(data)).toBe(201);
    const db = await mf.getD1Database("DB");
    const receipt = await db
      .prepare("SELECT * FROM deployment_assets WHERE id=?")
      .bind(data.id)
      .first();
    expect(JSON.stringify(receipt)).not.toContain(key);
    expect(receipt).toMatchObject({
      session: session.slice(15),
      url: endpoint,
      token: "TAKE_WEBM",
    });
    expect(
      deploymentRequests.every(
        (r) => r.authorised && r.host === "caller-owned.run.comfy.app",
      ),
    ).toBe(true);
    const before = deploymentRequests.length;
    expect(
      (
        await call("/api/settings/deployment-assets/TAKE_WEBM", {
          method: "POST",
          headers: {
            cookie: session,
            "x-byo-key": key,
            "content-type": "video/webm",
          },
          body: new Uint8Array([1, 2, 3]),
        })
      ).status,
    ).toBe(400);
    expect(deploymentRequests).toHaveLength(before);
  });
  it("refuses an unknown input role, and a session at its ticket cap, before uploading", async () => {
    const session = newSession();
    await settings(session);
    const upload = (token: string) =>
      call(`/api/settings/deployment-assets/${token}`, {
        method: "POST",
        headers: {
          cookie: session,
          "x-byo-key": key,
          "content-type": "video/webm",
        },
        body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]),
      });
    const before = deploymentRequests.length;
    expect((await upload("NOT_A_ROLE")).status).toBe(400);
    const db = await mf.getD1Database("DB");
    for (let i = 0; i < 32; i++)
      await db
        .prepare(
          "INSERT INTO deployment_assets(id,session,url,token,reference,expires) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          session.slice(15),
          endpoint,
          "TAKE_WEBM",
          "{}",
          Date.now() + 7200000,
        )
        .run();
    expect((await upload("TAKE_WEBM")).status).toBe(429);
    expect(deploymentRequests).toHaveLength(before);
  });
  it("requires setup and owned tickets before quoting, and confirmation before submission", async () => {
    expect(
      (
        await call("/api/quotes", {
          method: "POST",
          headers: headers(newSession()),
          body: JSON.stringify(input),
        })
      ).status,
    ).toBe(400);
    const session = newSession();
    const body = await staged(session);
    const other = newSession();
    await settings(other);
    expect(
      (
        await call("/api/quotes", {
          method: "POST",
          headers: headers(other),
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(400);
    const before = deploymentRequests.filter(
      (r) => r.path === "/api/v2/jobs",
    ).length;
    expect((await submit(session, body)).status).toBe(400);
    const quote = await quoted(session, body);
    expect(quote.billing).toContain("deployment's workspace");
    expect(
      deploymentRequests.filter((r) => r.path === "/api/v2/jobs"),
    ).toHaveLength(before);
    expect(quote.recipe).toMatchObject({
      location: "deployment",
      deployment: { url: endpoint },
    });
  });
  it("binds quotes to presets and endpoint and sends one reserved job under concurrency", async () => {
    const session = newSession();
    const body = await staged(session);
    const old = await quoted(session, body);
    const changed = await call("/api/settings/workflows/selection", {
      method: "POST",
      headers: { cookie: session, "content-type": "application/json" },
      body: JSON.stringify({
        entry: input.model,
        template: "world-builder-l2r-a2v-studio",
      }),
    });
    expect(changed.status).toBe(200);
    expect((await submit(session, body, old.id)).status).toBe(409);
    const quote = await quoted(session, body);
    const id = crypto.randomUUID();
    const before = deploymentRequests.filter(
      (r) => r.method === "POST" && r.path === "/api/v2/jobs",
    ).length;
    const results = await Promise.all([
      submit(session, body, quote.id, id),
      submit(session, body, quote.id, id),
    ]);
    expect(results.map((r) => r.status)).toEqual([202, 202]);
    const { job } = (await results[0].json()) as { job: Job };
    expect((await results[1].json()) as object).toMatchObject({
      job: { id: job.id },
    });
    expect(
      deploymentRequests.filter(
        (r) => r.method === "POST" && r.path === "/api/v2/jobs",
      ),
    ).toHaveLength(before + 1);
    // Change the current endpoint: polling must keep the endpoint frozen with the job.
    await settings(session, "https://other.run.comfy.app");
    const polled = await call(`/api/jobs/${job.id}`, {
      headers: headers(session),
    });
    const ready = (await polled.json()) as { job: Job };
    expect(ready.job.status, JSON.stringify(ready)).toBe("Ready");
    expect(ready.job.companions?.length).toBeGreaterThan(0);
    expect(
      deploymentRequests
        .filter((r) => r.path.includes("jobs/deployed-1"))
        .every((r) => r.host === "caller-owned.run.comfy.app"),
    ).toBe(true);
    const audio = await call(ready.job.companions![0].url, {
      headers: { cookie: session },
    });
    expect(audio.headers.get("content-type")).toBe("audio/wav");
    expect(
      (
        await call(ready.job.companions![0].url, {
          headers: { cookie: newSession() },
        })
      ).status,
    ).toBe(404);
    const persisted = await (
      await mf.getD1Database("DB")
    )
      .prepare("SELECT * FROM jobs WHERE id=?")
      .bind(job.id)
      .first();
    expect(JSON.stringify(persisted)).not.toContain(key);
  });
  it("never resubmits an uncertain paid call", async () => {
    const session = newSession();
    const body = await staged(session);
    const quote = await quoted(session, body);
    const id = crypto.randomUUID();
    const before = deploymentRequests.filter(
      (r) => r.method === "POST" && r.path === "/api/v2/jobs",
    ).length;
    deploymentFault.uncertain = true;
    try {
      const response = await submit(session, body, quote.id, id);
      expect((await response.json()) as object).toMatchObject({
        job: { status: "Error" },
      });
      await submit(session, body, quote.id, id);
      expect(
        deploymentRequests.filter(
          (r) => r.method === "POST" && r.path === "/api/v2/jobs",
        ),
      ).toHaveLength(before + 1);
    } finally {
      deploymentFault.uncertain = false;
    }
  });
  it("recovers every companion after the final job save fails", async () => {
    const session = newSession();
    const body = await staged(session);
    const quote = await quoted(session, body);
    const response = await submit(session, body, quote.id);
    const { job } = (await response.json()) as { job: Job };
    const db = await mf.getD1Database("DB");
    const before = deploymentRequests.filter(
      (r) => r.method === "POST" && r.path === "/api/v2/jobs",
    ).length;
    await db
      .prepare(
        `CREATE TRIGGER fail_deployment_ready BEFORE UPDATE ON jobs
      WHEN json_extract(NEW.data,'$.status')='Ready'
      BEGIN SELECT RAISE(FAIL, 'injected final job save failure'); END`,
      )
      .run();
    try {
      expect(
        (await call(`/api/jobs/${job.id}`, { headers: headers(session) }))
          .status,
      ).toBe(500);
      expect(
        await db
          .prepare("SELECT job FROM deployment_outputs WHERE job=?")
          .bind(job.id)
          .first(),
      ).toEqual({ job: job.id });
    } finally {
      await db.prepare("DROP TRIGGER fail_deployment_ready").run();
      await db
        .prepare("UPDATE jobs SET lease_until=0 WHERE id=?")
        .bind(job.id)
        .run();
    }
    const retried = await call(`/api/jobs/${job.id}`, {
      headers: headers(session),
    });
    const ready = (await retried.json()) as { job: Job };
    expect(ready.job.status).toBe("Ready");
    expect(ready.job.companions).toContainEqual({
      assetId: `${job.id}-audio-13`,
      label: "Room wet mix",
      url: `/api/clips/${job.id}-audio-13`,
      mediaType: "audio",
      contentType: "audio/wav",
    });
    expect(
      await db
        .prepare("SELECT job FROM deployment_outputs WHERE job=?")
        .bind(job.id)
        .first(),
    ).toBeNull();
    expect(
      deploymentRequests.filter(
        (r) => r.method === "POST" && r.path === "/api/v2/jobs",
      ),
    ).toHaveLength(before);
  });
});
