// The Worker under test: one workerd per test file, with isolated D1/R2, every
// migration applied, and a fake BFL whose submissions the tests count.
import { fakeDeployment } from "./worker-deploy-provider";
import { afterAll, beforeAll, beforeEach } from "vitest";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as MFResponse,
} from "miniflare";
import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { JOB_MAX_AGE_MS } from "../shared/lifecycle";

// Read through live bindings by the test files; only the harness assigns them.
export let mf: Miniflare;
export let submissions = 0;
export let lastSubmission: Record<string, unknown> = {};
export let cookie = "";
export let imageFixture = new Uint8Array();
/** What reached the fake Comfy Cloud, without the key itself. */
export const cloudRequests: {
  method: string;
  path: string;
  bearer: boolean;
  idempotency: string | null;
  body?: Record<string, unknown>;
}[] = [];
/** What reached the fake Router's queued submit, without the key itself. */
export const routerRequests: {
  path: string;
  apiKey: boolean;
  idempotency: string | null;
  body: Record<string, unknown>;
}[] = [];
const cloudJob = (status: string, outputs: object[] = []) => ({
  id: "wf-1",
  status,
  created_at: "2026-10-21T00:00:00Z",
  started_at: null,
  completed_at: null,
  expires_at: "2026-10-22T00:00:00Z",
  queue_position: null,
  progress: null,
  outputs,
  error: null,
  urls: { self: "/api/v2/jobs/wf-1", events: "", cancel: "" },
});
/** Provider faults a test switches on, and must switch off again. */
export const faults = {
  failSubmit: false,
  failPoll: false,
  /** Holds every balance check until it settles, to stage a race. */
  holdCredits: null as Promise<void> | null,
};
/** A BFL key whose balance is empty, so its run is refused before reservation. */
export const POOR_KEY = "test-poor-key";
let testIp = 0;
let imageDelivery = false;

export const input = {
  generator: "video" as const,
  description: "A ceramic vessel.",
  presetId: "orbit_l" as const,
  cameraEnabled: true,
  duration: 5,
  resolution: "hd" as const,
  draft: false,
  upscaleFactor: 2,
};
export const call = (
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Uint8Array;
  } = {},
) =>
  mf.dispatchFetch(`https://studio.test${path}`, {
    ...init,
    headers: {
      cookie,
      "cf-connecting-ip": `192.0.2.${testIp}`,
      ...init.headers,
    },
  });
/** Writes are rate limited per session, so cases that can stand alone get their own. */
export const newSession = () => `camera_session=${randomUUID()}`;
export const post = (id: string, body: object = input, session = cookie) =>
  call("/api/jobs", {
    method: "POST",
    headers: {
      cookie: session,
      "x-byo-key": "test-only-key",
      "idempotency-key": id,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
export type TestDatabase = Awaited<ReturnType<Miniflare["getD1Database"]>>;
/** miniflare's binding types do not survive this tsconfig; these are their shapes. */
export type TestBucket = {
  put: (key: string, body: Uint8Array) => Promise<unknown>;
  head: (key: string) => Promise<unknown | null>;
};
export type CronTrigger = {
  scheduled: (options: {
    scheduledTime: Date;
    cron: string;
  }) => Promise<{ outcome: string }>;
};

/** A paid job left non-terminal past the age limit, as a closed tab leaves one. */
export async function insertStaleJob(
  db: TestDatabase,
  session: string,
  id: string,
  age = JOB_MAX_AGE_MS + 1000,
  status = "Generating",
) {
  const job = { ...input, id, status, keyMode: "byo" };
  await db
    .prepare(
      "INSERT INTO jobs (id,session,idempotency,input,data,created_at) VALUES (?,?,?,?,?,?)",
    )
    .bind(
      id,
      session,
      `${id}-key`,
      JSON.stringify(input),
      JSON.stringify(job),
      Date.now() - age,
    )
    .run();
}

/** Starts the Worker for the calling test file and stops it afterwards. */
export function useWorker() {
  beforeEach(() => {
    testIp++;
    imageDelivery = false;
  });
  beforeAll(async () => {
    const bundle = await build({
      entryPoints: ["worker/index.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      // As scripts/build-pages.mjs: workerd resolves the SDK's node: imports.
      external: ["node:*"],
    });
    const clip = await readFile("tests/fixtures/metadata.mp4");
    mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: bundle.outputFiles[0].text,
        compatibilityDate: "2026-09-19",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        r2Buckets: ["MEDIA"],
        serviceBindings: { ASSETS: () => new MFResponse("asset") },
        outboundService: async (request) => {
          const deployed = await fakeDeployment(request, clip);
          if (deployed) return deployed;
          const url = new URL(request.url);
          if (url.hostname === "api.bfl.ai" && url.pathname === "/v1/credits") {
            if (faults.holdCredits) await faults.holdCredits;
            return MFResponse.json({
              credits: request.headers.get("x-key") === POOR_KEY ? 0 : 10000,
            });
          }
          if (url.hostname === "api.bfl.ai" && request.method === "POST") {
            imageDelivery = url.pathname === "/v1/flux-3-image";
            submissions++;
            lastSubmission = (await request.json()) as Record<string, unknown>;
            if (faults.failSubmit)
              return new MFResponse("unknown", { status: 503 });
            return MFResponse.json({
              id: "provider-test",
              polling_url: "https://api.bfl.ai/v1/get_result?id=provider-test",
              cost: 85,
            });
          }
          if (
            url.hostname === "api.bfl.ai" &&
            url.pathname === "/v1/get_result" &&
            faults.failPoll
          )
            return MFResponse.json(
              { id: "provider-test", status: "Error", result: null },
              { status: 500 },
            );
          if (
            url.hostname === "api.bfl.ai" &&
            url.pathname === "/v1/get_result"
          )
            return MFResponse.json({
              id: "provider-test",
              status: "Ready",
              result: { sample: "https://delivery.bfl.ai/clip.mp4" },
            });
          if (url.hostname === "api.comfy.org" && request.method === "POST") {
            routerRequests.push({
              path: url.pathname,
              apiKey: /^comfyui-/.test(request.headers.get("x-api-key") ?? ""),
              idempotency: request.headers.get("idempotency-key"),
              body: (await request.json()) as Record<string, unknown>,
            });
            return MFResponse.json(
              {
                request_id: "req_router",
                status: "IN_QUEUE",
                status_url: `https://api.comfy.org${url.pathname}/req_router/status`,
              },
              { status: 201 },
            );
          }
          // A Comfy key is checked against Router's free catalogue read; there
          // is no balance to report.
          if (url.hostname === "api.comfy.org" && request.method === "GET")
            return url.pathname.startsWith("/v2/models/")
              ? MFResponse.json({ id: "ltx/ltx-2-5-fast" })
              : new MFResponse("none", { status: 404 });
          if (url.hostname === "cloud.comfy.org") {
            cloudRequests.push({
              method: request.method,
              path: url.pathname,
              bearer: /^Bearer comfyui-/.test(
                request.headers.get("authorization") ?? "",
              ),
              idempotency: request.headers.get("idempotency-key"),
              ...(request.method === "POST" && url.pathname === "/api/v2/jobs"
                ? { body: (await request.json()) as Record<string, unknown> }
                : {}),
            });
            if (url.pathname === "/api/v2/assets")
              return MFResponse.json(
                { id: crypto.randomUUID() },
                { status: 201 },
              );
            if (url.pathname === "/api/v2/jobs")
              return MFResponse.json(cloudJob("queued"), { status: 201 });
            if (url.pathname === "/api/v2/jobs/wf-1")
              return MFResponse.json(
                cloudJob("succeeded", [
                  {
                    id: "asset-1",
                    node_id: "75",
                    name: "clip.mp4",
                    type: "video",
                    content_type: "video/mp4",
                    size_bytes: clip.length,
                  },
                ]),
              );
            if (url.pathname === "/api/v2/assets/asset-1/content")
              return new MFResponse(null, {
                status: 302,
                headers: { Location: "https://delivery.bfl.ai/signed.mp4" },
              });
          }
          if (url.hostname === "delivery.bfl.ai")
            return new MFResponse(imageDelivery ? imageFixture : clip, {
              headers: {
                "content-length": String(
                  imageDelivery ? imageFixture.length : clip.length,
                ),
              },
            });
          throw new Error(`Unexpected outbound request: ${url.hostname}`);
        },
      }),
    );
    imageFixture = new Uint8Array(
      await readFile("tests/fixtures/reference.png"),
    );
    const db = await mf.getD1Database("DB");
    // Apply every migration in order, as `wrangler d1 migrations apply` would.
    for (const file of (await readdir("migrations")).sort())
      for (const statement of (await readFile(`migrations/${file}`, "utf8"))
        .split(";")
        .filter((s) => s.replace(/--[^\n]*/g, "").trim()))
        await db.prepare(statement).run();
    const bindings = await mf.getBindings<{ MEDIA: TestBucket }>();
    await bindings.MEDIA.put("test/metadata.mp4", clip);
    cookie = (await call("/api/health")).headers
      .get("set-cookie")!
      .split(";")[0];
    const session = cookie.slice("camera_session=".length);
    await db
      .prepare(
        "INSERT INTO sources (id,session,data,object_key,bytes) VALUES (?,?,?,?,?)",
      )
      .bind(
        "fixture-source",
        session,
        JSON.stringify({
          id: "fixture-source",
          label: "Metadata fixture",
          url: "/api/clips/fixture-source",
          width: 960,
          height: 528,
          duration: 10.041667,
          origin: "upload",
        }),
        "test/metadata.mp4",
        clip.length,
      )
      .run();
  }, 30000);
  afterAll(async () => {
    await mf?.dispose();
  });
}
