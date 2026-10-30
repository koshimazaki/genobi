import { describe, expect, it } from "vitest";
import type { Job } from "../shared/types";
import { call, cloudRequests, newSession, useWorker } from "./worker-harness";

// The workflow route inside workerd: the Worker bundles @comfyorg/sdk with its
// node: imports left to nodejs_compat, as scripts/build-pages.mjs does.
useWorker();

const key = "comfyui-worker-test-key";
const acoustic = {
  generator: "video",
  description: "A drummer warms up.",
  presetId: "orbit_l",
  cameraEnabled: true,
  duration: 6,
  resolution: "hd",
  draft: false,
  upscaleFactor: 2,
  model: "ltx-2.5-akuspace",
  acoustic: { mode: "room", preset: "empty_club", level: "high" },
};

describe("Cloudflare adapter: the workflow route through the Comfy SDK", () => {
  it("submits once to Comfy Cloud v2, polls, and saves the signed output", async () => {
    const session = newSession();
    const response = await call("/api/jobs", {
      method: "POST",
      headers: {
        cookie: session,
        "x-byo-key": key,
        "idempotency-key": "worker-workflow-1",
        "content-type": "application/json",
      },
      body: JSON.stringify(acoustic),
    });
    expect(response.status).toBe(202);
    const { job } = (await response.json()) as { job: Job };
    expect(job.status).toBe("Pending");
    const posts = cloudRequests.filter((r) => r.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      path: "/api/v2/jobs",
      bearer: true,
      idempotency: job.id,
    });
    const workflow = posts[0].body!.workflow as Record<
      string,
      { inputs: Record<string, unknown> }
    >;
    expect(workflow["398:376"].inputs.value).toMatch(/no crowd$/);
    const polled = await call(`/api/jobs/${job.id}`, {
      headers: { cookie: session, "x-byo-key": key },
    });
    const { job: ready } = (await polled.json()) as { job: Job };
    expect(ready.status).toBe("Ready");
    expect(cloudRequests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /api/v2/jobs",
      "GET /api/v2/jobs/wf-1",
      "GET /api/v2/assets/asset-1/content",
    ]);
    expect(cloudRequests.every((r) => r.bearer)).toBe(true);
    const take = await call(`/api/takes/${job.id}`, {
      headers: { cookie: session },
    });
    expect(
      ((await take.json()) as { take: Job & { recipe: unknown } }).take,
    ).toMatchObject({ recipe: { id: "ltx-2-5-akuspace", route: "workflow" } });
  });
  it("submits open Klein to Comfy Cloud v2 with its rows past the upsampler", async () => {
    const session = newSession();
    // The harness keeps every Cloud request for the file; read this test's own.
    const before = cloudRequests.length;
    const posts = () =>
      cloudRequests.slice(before).filter((r) => r.method === "POST");
    const rows = JSON.stringify([
      { id: "kite_1", bbox: [100, 100, 400, 500], desc: "a red kite" },
    ]);
    const response = await call("/api/jobs", {
      method: "POST",
      headers: {
        cookie: session,
        "x-byo-key": key,
        "idempotency-key": "worker-klein-1",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        generator: "image",
        model: "flux-3-klein",
        description: `A kite festival. ${rows}`,
        imageAspectRatio: "1:1",
        imageResolution: "1k",
      }),
    });
    expect(response.status).toBe(202);
    const { job } = (await response.json()) as { job: Job };
    expect(job).toMatchObject({ status: "Pending", mediaType: "image" });
    expect(posts()).toHaveLength(1);
    const workflow = posts()[0].body!.workflow as Record<
      string,
      { inputs: Record<string, unknown> }
    >;
    expect(workflow["18:17"].inputs.value).toBe("A kite festival.");
    expect(workflow["18:20"].inputs.string_b).toBe(rows);
    expect(workflow["18:16"].inputs.switch).toBe(false);
    expect(workflow["18:6"].inputs).toMatchObject({
      width: 1024,
      height: 1024,
    });
    // A box off the grid is refused before anything is sent.
    const refused = await call("/api/jobs", {
      method: "POST",
      headers: {
        cookie: session,
        "x-byo-key": key,
        "idempotency-key": "worker-klein-2",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        generator: "image",
        model: "flux-3-klein",
        description: `A kite. ${rows.replace("500", "1500")}`,
        imageAspectRatio: "1:1",
      }),
    });
    expect(refused.status).toBe(400);
    expect(posts()).toHaveLength(1);
  });

  it("refuses music before any quote, reservation or Cloud request", async () => {
    const session = newSession();
    const before = cloudRequests.length;
    const music = JSON.stringify({
      generator: "audio",
      model: "minimax-music-3",
      description: "Synthwave teaser, 128 BPM, no vocals.",
      duration: 20,
    });
    const headers = {
      cookie: session,
      "x-byo-key": key,
      "content-type": "application/json",
    };
    for (const [path, extra] of [
      ["/api/quotes", {}],
      ["/api/jobs", { "idempotency-key": "worker-music-1" }],
    ] as const) {
      const response = await call(path, {
        method: "POST",
        headers: { ...headers, ...extra },
        body: music,
      });
      expect(response.status, path).toBe(501);
      expect(await response.json()).toMatchObject({
        code: "audio_local_only",
        error: expect.stringMatching(/Nothing was sent or charged/),
      });
    }
    expect(cloudRequests.length).toBe(before);
    const history = await call("/api/history", {
      headers: { cookie: session },
    });
    expect(((await history.json()) as { jobs: Job[] }).jobs).toEqual([]);
  });

  it("says the hosted run location is Comfy Cloud and cannot swap", async () => {
    const session = newSession();
    const location = await call("/api/settings/run-location", {
      headers: { cookie: session },
    });
    expect(await location.json()).toMatchObject({
      location: "cloud",
      fixed: true,
      choices: ["cloud"],
      local: null,
      // The same contract as the local server; hosted settings never change.
      revision: 0,
    });
    const workflows = (await (
      await call("/api/settings/workflows", { headers: { cookie: session } })
    ).json()) as {
      fixed: boolean;
      revision: number;
      entries: { selected: string }[];
      capabilities: { id: string }[];
      templates: { id: string }[];
    };
    expect(workflows.fixed).toBe(true);
    expect(workflows.revision).toBe(0);
    // Music and the swap are local-only: the hosted catalogue lists neither
    // their entries, their capabilities nor their templates.
    expect(workflows.entries.map((e) => e.selected)).toEqual([
      "minimax-h3-rgb",
      "minimax-h3-canny",
      "minimax-h3-depth",
      "minimax-h3-combined",
      "ltx-2-5-t2v",
      "ltx-2-5-akuspace-t2v",
      "seedvr2-upscale",
      "flux-3-klein-t2i",
    ]);
    expect(workflows.capabilities.map((c) => c.id)).not.toContain(
      "text-to-music",
    );
    expect(workflows.templates.map((t) => t.id)).not.toContain(
      "minimax-music-3",
    );
    expect(workflows.templates.map((t) => t.id)).not.toContain(
      "openjutsu-swap",
    );
  });
});
