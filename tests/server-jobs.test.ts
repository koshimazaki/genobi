import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { request as httpRequest } from "node:http";
import { describe, expect, it } from "vitest";
import { JOB_MAX_AGE_MS } from "../shared/lifecycle";
import { localRateLimit, RATE_LIMITS } from "../shared/limits";
import { presets } from "../shared/presets";
import { input, setup } from "./server-harness";

// Paid submissions through Express: keys, composed cameras, deduplication,
// ownership, copying before Ready, takes, replay, expiry and read limits.
describe("local job API: jobs, replay, ownership and lifecycle", () => {
  it("checks the effective account key without persisting it or creating paid jobs", async () => {
    const { base, bfl, directory, store } = await setup();
    const server = await fetch(`${base}/api/credits`);
    expect(server.headers.get("cache-control")).toBe("no-store");
    expect(await server.json()).toEqual({
      credits: 1250,
      checkedAt: expect.any(String),
      provider: "bfl",
    });
    const byo = await fetch(`${base}/api/credits`, {
      headers: { "x-byo-key": "visitor-balance-key" },
    });
    expect(await byo.json()).toEqual({
      credits: 0,
      checkedAt: expect.any(String),
      provider: "bfl",
    });
    const invalid = await fetch(`${base}/api/credits`, {
      headers: { "x-byo-key": "bad" },
    });
    expect(invalid.status).toBe(400);
    expect(bfl.creditKeys).toEqual(["test-server-key", "visitor-balance-key"]);
    expect(bfl.submissions).toBe(0);
    expect(store.data.jobs).toHaveLength(0);
    await store.save();
    expect(
      await readFile(path.join(directory, "jobs.json"), "utf8"),
    ).not.toContain("visitor-balance-key");
  });
  it("persists and forwards a composed camera, with canonical idempotency and session ownership", async () => {
    const { post, bfl, base, cookie, store } = await setup();
    const body = {
      ...input,
      presetId: undefined,
      camera: { "shot-sizes": "close-up", angles: "dutch", movements: "pan" },
      cameraEdits: { pan: "Pan gently.", dutch: "" },
    };
    const response = await post("section-request", body);
    expect(response.status).toBe(202);
    const { job } = await response.json();
    expect(job.camera).toEqual(body.camera);
    expect(job.prompt).toBe(
      "A ceramic vessel.\n\nClose-up of the subject.\n\nPan gently.",
    );
    expect(bfl.requests[0].body.prompt).toBe(job.prompt);
    expect(store.data.jobs[0].cameraEdits).toEqual({
      dutch: "",
      pan: "Pan gently.",
    });
    const repeated = await post("section-request", {
      ...body,
      camera: { movements: "pan", angles: "dutch", "shot-sizes": "close-up" },
      cameraEdits: { dutch: "", pan: "Pan gently." },
    });
    expect(repeated.status).toBe(202);
    expect(bfl.submissions).toBe(1);
    expect(
      (
        await post("section-request", {
          ...body,
          cameraEdits: { pan: "Changed" },
        })
      ).status,
    ).toBe(409);
    expect(
      (await fetch(`${base}/api/jobs/${job.id}`, { headers: { cookie } }))
        .status,
    ).toBe(200);
    expect((await fetch(`${base}/api/jobs/${job.id}`)).status).toBe(404);
  });

  it("deduplicates submits, converts credits, strips private provider fields, and reserves concurrent costs", async () => {
    const { post, bfl, store, base, cookie } = await setup();
    const [first, repeat] = await Promise.all([
      post("same-request"),
      post("same-request"),
    ]);
    const firstJob = (await first.json()).job;
    expect((await repeat.json()).job.id).toBe(firstJob.id);
    expect(bfl.submissions).toBe(1);
    expect(firstJob.costActualUsd).toBe(0.85);
    expect(firstJob.pollingUrl).toBeUndefined();
    expect(firstJob.sessionId).toBeUndefined();
    const results = await Promise.all(
      ["request-two", "request-three", "request-four"].map((id) => post(id)),
    );
    expect(results.filter((result) => result.status === 429)).toHaveLength(1);
    expect(bfl.submissions).toBe(3);
    expect(store.data.jobs).toHaveLength(3);
    const history = await (
      await fetch(`${base}/api/history`, { headers: { cookie } })
    ).text();
    expect(history).not.toContain("test-server-key");
    expect(history).not.toContain("api.bfl.ai");
  });

  it("never retries an uncertain paid submit and never persists BYO credentials", async () => {
    const { post, bfl, directory } = await setup();
    bfl.failSubmit = true;
    const key = "private-visitor-key";
    const first = await (
      await post("byo-request", input, { "x-byo-key": key })
    ).json();
    expect(first.job.status).toBe("Error");
    await post("byo-request", input, { "x-byo-key": key });
    expect(bfl.submissions).toBe(1);
    expect(
      await readFile(path.join(directory, "jobs.json"), "utf8"),
    ).not.toContain(key);
  });

  it("requires session ownership and the BYO key for resume, and serves byte ranges from .local", async () => {
    const { post, base, cookie, bfl, store, directory } = await setup();
    const { job } = await (
      await post("byo-running", input, { "x-byo-key": "private-visitor-key" })
    ).json();
    const noKey = await (
      await fetch(`${base}/api/jobs/${job.id}`, { headers: { cookie } })
    ).json();
    expect(noKey.needsKey).toBe(true);
    expect(bfl.polls).toBe(0);
    expect((await fetch(`${base}/api/jobs/${job.id}`)).status).toBe(404);
    const file = path.join(directory, "media", "range.mp4");
    await writeFile(file, "0123456789");
    store.data.sources.push({
      id: "range",
      filePath: file,
      sessionId: store.data.jobs[0].sessionId,
      label: "Range fixture",
      url: "/api/clips/range",
      width: 1280,
      height: 720,
      duration: 5,
      origin: "upload",
    });
    const response = await fetch(`${base}/api/clips/range`, {
      headers: { cookie, Range: "bytes=2-5" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await response.text()).toBe("2345");
    expect(response.headers.get("content-type")).toBe("video/mp4");
  });

  it("rejects cross-origin requests and conflicting idempotency replays", async () => {
    const { post, base } = await setup();
    expect(
      (
        await post("origin-request", input, {
          origin: "https://untrusted.example",
        })
      ).status,
    ).toBe(403);
    await post("replay-request");
    expect(
      (
        await post("replay-request", {
          ...input,
          description: "Different scene",
        })
      ).status,
    ).toBe(409);
    const blockedHost = await new Promise<number | undefined>((resolve) => {
      const request = httpRequest(
        `${base}/api/health`,
        { headers: { host: "untrusted.example" } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      request.end();
    });
    expect(blockedHost).toBe(403);
  });

  it("copies completed media before Ready and exposes a usable source for upscaling", async () => {
    const { post, bfl, base, cookie, store } = await setup();
    bfl.media = new Uint8Array(
      await readFile(path.resolve("tests/fixtures/metadata.mp4")),
    );
    bfl.ready = true;
    const { job } = await (await post("copy-request")).json();
    const result = await (
      await fetch(`${base}/api/jobs/${job.id}`, { headers: { cookie } })
    ).json();
    expect(result.job.status).toBe("Ready");
    expect(result.job.resultUrl).toBe(`/api/clips/${job.id}`);
    expect(result.job.resultRemoteUrl).toBeUndefined();
    expect(store.data.sources[0].width).toBe(960);
    expect(
      (
        await fetch(`${base}${result.job.resultUrl}`, {
          headers: { cookie, Range: "bytes=0-31" },
        })
      ).status,
    ).toBe(206);
    const upscale = await post("upscale-request", {
      ...input,
      generator: "upscale",
      sourceId: job.id,
    } as typeof input);
    const upscaleJob = (await upscale.json()).job;
    expect(upscaleJob.cameraEnabled).toBe(false);
    expect(upscaleJob.prompt).toBe("");
    expect(upscaleJob.costEstimateUsd).toBeGreaterThan(1);
  });

  it("records a take beside the job and serves it once the output is ours", async () => {
    const { post, bfl, base, cookie, store } = await setup();
    bfl.media = new Uint8Array(
      await readFile(path.resolve("tests/fixtures/metadata.mp4")),
    );
    const take = (id: string, session = cookie) =>
      fetch(`${base}/api/takes/${id}`, { headers: { cookie: session } });
    const { job } = await (
      await post("take-request", { ...input, projectRevision: 4 })
    ).json();
    expect(job.projectRevision).toBe(4);
    // Input hashes stay beside the job, never in its public data.
    expect(job).not.toHaveProperty("take");
    const waiting = await take(job.id);
    expect(waiting.status).toBe(409);
    expect((await waiting.json()).code).toBe("take_not_ready");
    bfl.ready = true;
    await fetch(`${base}/api/jobs/${job.id}`, { headers: { cookie } });
    const response = await take(job.id);
    expect(response.status).toBe(200);
    expect((await response.json()).take).toMatchObject({
      version: 1,
      operationId: job.id,
      recipe: { id: "flux-3-video", version: 1, route: "bfl" },
      inputs: [
        { role: "settings", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
      ],
      outputs: [
        {
          assetId: job.id,
          mediaType: "video",
          contentType: "video/mp4",
          available: true,
        },
      ],
      receipt: { estimateUsd: job.costEstimateUsd, actualUsd: 0.85 },
      projectRevision: 4,
    });
    expect(
      (await take(job.id, "camera_session=" + "0".repeat(36))).status,
    ).toBe(404);
    // Another revision is another request; a fraction is no revision.
    expect(
      (await post("take-request", { ...input, projectRevision: 5 })).status,
    ).toBe(409);
    expect(
      (await post("take-fraction", { ...input, projectRevision: 1.5 })).status,
    ).toBe(400);
    // A run from before takes still answers, honestly.
    delete store.data.jobs.find((item) => item.id === job.id)!.take;
    const legacy = await take(job.id);
    expect(legacy.status).toBe(404);
    expect((await legacy.json()).code).toBe("take_missing");
  });

  it("replays legacy jobs with default controls but rejects changed camera edits or aspect", async () => {
    const { post, bfl, store } = await setup();
    const { job } = await (await post("legacy-video")).json();
    const legacy = store.data.jobs[0] as Partial<
      (typeof store.data.jobs)[number]
    >;
    delete legacy.aspectRatio;
    delete legacy.upscaleCreativity;
    const unchanged = await post("legacy-video");
    expect((await unchanged.json()).job.id).toBe(job.id);
    const explicit = await post("legacy-video", {
      ...input,
      aspectRatio: "16:9",
      cameraText: presets[0].clause,
    });
    expect((await explicit.json()).job.id).toBe(job.id);
    expect(
      (
        await post("legacy-video", {
          ...input,
          cameraText: "An edited camera instruction.",
        })
      ).status,
    ).toBe(409);
    expect(
      (await post("legacy-video", { ...input, cameraText: "" })).status,
    ).toBe(409);
    expect(
      (await post("legacy-video", { ...input, aspectRatio: "1:1" })).status,
    ).toBe(409);
    const blank = await post("blank-video", { ...input, cameraText: "" });
    expect((await blank.json()).job.prompt).toBe("A ceramic vessel.");
    expect((await post("blank-video", input)).status).toBe(409);
    expect(bfl.submissions).toBe(2);
  });
  it("replays a run recorded while Audio was a switch, whatever it said", async () => {
    const { post, bfl, store } = await setup();
    const { job } = await (await post("audio-era-video")).json();
    // What a job recorded before audio was always on holds.
    Object.assign(store.data.jobs[0], { audio: false });
    for (const body of [input, { ...input, audio: false }]) {
      const replay = await post("audio-era-video", body);
      expect(replay.status).toBe(202);
      expect((await replay.json()).job.id).toBe(job.id);
    }
    expect(bfl.submissions).toBe(1);
  });
  it("ages out a job the browser never came back for", async () => {
    const { post, base, cookie, store, service } = await setup();
    const { job } = await (
      await post("abandoned", input, { "x-byo-key": "private-visitor-key" })
    ).json();
    expect(store.data.jobs[0].status).toBe("Pending");
    // The tab closes; nothing else can advance a visitor-key job.
    store.data.jobs[0].createdAt = new Date(
      Date.now() - JOB_MAX_AGE_MS - 1000,
    ).toISOString();
    await service.sweep();
    expect(store.data.jobs[0].status).toBe("expired");
    const read = await (
      await fetch(`${base}/api/jobs/${job.id}`, { headers: { cookie } })
    ).json();
    expect(read.job.status).toBe("expired");
    expect(read.job.error).toContain("30-minute");
  });

  it("gives read routes a ceiling here too, not only paid writes", async () => {
    const { base, cookie } = await setup();
    const seen = new Set<number>();
    for (let attempt = 0; attempt <= localRateLimit("history"); attempt++)
      seen.add(
        (await fetch(`${base}/api/history`, { headers: { cookie } })).status,
      );
    // Everything up to the ceiling was served; the request past it was not.
    expect(seen).toEqual(new Set([200, 429]));
  });

  it("serves several page loads of local reads without running out", async () => {
    const { base, cookie } = await setup();
    // About twenty reads per load: five loads (Vite reloads, refreshes) pass
    // locally, where the hosted ceiling for D1 reads would refuse them.
    const routes = [
      "/api/history",
      "/api/settings/run-location",
      "/api/chains",
    ];
    for (let n = 0; n < 100; n++)
      expect(
        (await fetch(`${base}${routes[n % 3]}`, { headers: { cookie } }))
          .status,
      ).toBe(200);
    expect(RATE_LIMITS.history).toBeLessThan(100);
  });
});
