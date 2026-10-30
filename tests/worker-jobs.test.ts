import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Job } from "../shared/types";
import {
  mf,
  submissions,
  lastSubmission,
  imageFixture,
  faults,
  input,
  call,
  newSession,
  post,
  insertStaleJob,
  useWorker,
} from "./worker-harness";

// Paid submissions through the Worker: keys, deduplication, replay, quotes,
// takes and terminal provider errors.
useWorker();

describe("Cloudflare adapter jobs: submission, replay, quotes and takes", () => {
  it("delivers owned image output and keeps reference bytes out of D1 job data", async () => {
    const session = newSession();
    const reference = `data:image/png;base64,${Buffer.from(imageFixture).toString("base64")}`;
    const body = {
      generator: "edit",
      description: "Make image 1 blue.",
      imageReferences: [reference],
      imageResolution: "1k",
      imageGrounding: false,
    };
    const response = await post("worker-image-edit", body, session);
    expect(response.status).toBe(202);
    const { job } = (await response.json()) as { job: Job };
    expect(job.mediaType).toBe("image");
    expect(job.imageReferenceCount).toBe(1);
    expect(job).not.toHaveProperty("imageReferences");
    expect(lastSubmission).toMatchObject({
      resolution: "1k",
      grounding: false,
      images: [reference.split(",")[1]],
    });
    const replay = await post("worker-image-edit", body, session);
    expect(((await replay.json()) as { job: Job }).job.id).toBe(job.id);
    const db = await mf.getD1Database("DB");
    const row = await db
      .prepare("SELECT input, data FROM jobs WHERE id=?")
      .bind(job.id)
      .first<{ input: string; data: string }>();
    expect(JSON.stringify(row)).not.toContain("data:image");
    expect(row!.data).not.toContain("imageReferences");
    const polled = await call(`/api/jobs/${job.id}`, {
      headers: { cookie: session, "x-byo-key": "test-only-key" },
    });
    expect(((await polled.json()) as { job: Job }).job.status).toBe("Ready");
    const asset = await call(`/api/clips/${job.id}`, {
      headers: { cookie: session },
    });
    expect(asset.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await asset.arrayBuffer())).toEqual(imageFixture);
    const stolen = await call(`/api/clips/${job.id}`, {
      headers: { cookie: newSession() },
    });
    expect(stolen.status).toBe(404);
  });

  it("keeps retired stopped rows terminal even with no polling URL", async () => {
    const db = await mf.getD1Database("DB");
    const session = newSession();
    const id = randomUUID();
    await insertStaleJob(db, session.slice(15), id, 0, "stopped");
    const response = await call(`/api/jobs/${id}`, {
      headers: { cookie: session, "x-byo-key": "test-only-key" },
    });
    const { job } = (await response.json()) as { job: Job };
    expect(response.status).toBe(200);
    expect(job.status).toBe("stopped");
    expect(job.error).toBeUndefined();
    const { jobs } = (await (
      await call("/api/history", { headers: { cookie: session } })
    ).json()) as { jobs: Job[] };
    expect(jobs.find((item) => item.id === id)?.status).toBe("stopped");
  });
  it("rejects the retired stop endpoint without abandoning an accepted job", async () => {
    const session = newSession();
    const { job } = (await (
      await post("retired-stop-endpoint", input, session)
    ).json()) as { job: Job };
    const response = await call(`/api/jobs/${job.id}/stop`, {
      method: "POST",
      headers: { cookie: session, "x-byo-key": "test-only-key" },
    });
    expect(response.status).toBe(404);
    const result = (await (
      await call(`/api/jobs/${job.id}`, {
        headers: { cookie: session, "x-byo-key": "test-only-key" },
      })
    ).json()) as { job: Job };
    expect(result.job.status).toBe("Ready");
    expect(result.job.resultUrl).toBeTruthy();
  });

  it("persists a task-specific provider HTTP 500 as terminal instead of Planning", async () => {
    const session = newSession();
    const { job } = (await (
      await post("terminal-error-fixture", input, session)
    ).json()) as { job: Job };
    faults.failPoll = true;
    try {
      const result = (await (
        await call(`/api/jobs/${job.id}`, {
          headers: { cookie: session, "x-byo-key": "test-only-key" },
        })
      ).json()) as { job: Job };
      expect(result.job.status).toBe("Error");
      const history = (await (
        await call("/api/history", { headers: { cookie: session } })
      ).json()) as { jobs: Job[] };
      expect(history.jobs.find((item) => item.id === job.id)?.status).toBe(
        "Error",
      );
    } finally {
      faults.failPoll = false;
    }
  });

  it("requires a key and rejects cross-origin writes", async () => {
    expect(
      (await call("/api/jobs", { method: "POST", body: "{}" })).status,
    ).toBe(400);
    expect(
      (
        await call("/api/jobs", {
          method: "POST",
          headers: { origin: "https://other.test" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect((await call("/api/credits")).status).toBe(400);
  });
  it("checks a supplied key without persisting it", async () => {
    const response = await call("/api/credits", {
      headers: { "x-byo-key": "test-only-key" },
    });
    expect(await response.json()).toMatchObject({ credits: 10000 });
  });
  it("atomically deduplicates concurrent submissions, copies results and isolates media", async () => {
    const before = submissions;
    const session = newSession();
    const results = await Promise.all([
      post("worker-test-duplicate", input, session),
      post("worker-test-duplicate", input, session),
    ]);
    const first = (await results[0].json()) as { job: { id: string } };
    const second = (await results[1].json()) as { job: { id: string } };
    expect(first.job.id).toBe(second.job.id);
    expect(submissions - before).toBe(1);
    // Every FLUX 3 run asks for audio.
    expect(lastSubmission.generate_audio).toBe(true);
    expect(
      (
        await post(
          "worker-test-duplicate",
          { ...input, description: "Different" },
          session,
        )
      ).status,
    ).toBe(409);
    const result = await call(`/api/jobs/${first.job.id}`, {
      headers: { cookie: session, "x-byo-key": "test-only-key" },
    });
    const data = (await result.json()) as {
      job: { status: string; resultUrl: string };
    };
    expect(data.job.status).toBe("Ready");
    const media = await call(data.job.resultUrl, {
      headers: { cookie: session, range: "bytes=0-99" },
    });
    expect(media.status).toBe(206);
    expect((await media.arrayBuffer()).byteLength).toBe(100);
    expect(
      (await mf.dispatchFetch(`https://studio.test${data.job.resultUrl}`))
        .status,
    ).toBe(404);
    const history = await (
      await call("/api/history", { headers: { cookie: session } })
    ).text();
    expect(history).not.toContain("test-only-key");
    expect(history).not.toContain("polling_url");
    expect(history).not.toContain("delivery.bfl.ai");
  });
  it("records a take in its own column and serves it to its session once Ready", async () => {
    const session = newSession();
    const take = (id: string, cookieHeader = session) =>
      call(`/api/takes/${id}`, { headers: { cookie: cookieHeader } });
    const response = await post(
      "worker-take",
      { ...input, projectRevision: 7 },
      session,
    );
    const { job } = (await response.json()) as { job: Job };
    const db = await mf.getD1Database("DB");
    const row = await db
      .prepare("SELECT data, take FROM jobs WHERE id=?")
      .bind(job.id)
      .first<{ data: string; take: string }>();
    expect(row!.data).not.toContain("sha256");
    expect(JSON.parse(row!.take)).toMatchObject({
      recipe: { id: "flux-3-video", version: 1, route: "bfl" },
    });
    const waiting = await take(job.id);
    expect(waiting.status).toBe(409);
    expect(((await waiting.json()) as { code: string }).code).toBe(
      "take_not_ready",
    );
    await call(`/api/jobs/${job.id}`, {
      headers: { cookie: session, "x-byo-key": "test-only-key" },
    });
    const served = await take(job.id);
    expect(served.status).toBe(200);
    expect(((await served.json()) as { take: unknown }).take).toMatchObject({
      version: 1,
      operationId: job.id,
      inputs: [
        { role: "settings", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
      ],
      outputs: [{ assetId: job.id, available: true }],
      receipt: { estimateUsd: job.costEstimateUsd, actualUsd: 0.85 },
      projectRevision: 7,
    });
    expect((await take(job.id, newSession())).status).toBe(404);
    expect(
      (await post("worker-take", { ...input, projectRevision: 8 }, session))
        .status,
    ).toBe(409);
    // A row reserved before the migration has no take column value.
    const legacy = randomUUID();
    await insertStaleJob(db, session.slice(15), legacy, 0, "Ready");
    const missing = await take(legacy);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { code: string }).code).toBe(
      "take_missing",
    );
  });
  it("quotes without submitting and spends a quote in the reservation, once", async () => {
    const session = newSession();
    const before = submissions;
    const quoted = await call("/api/quotes", {
      method: "POST",
      headers: {
        cookie: session,
        "x-byo-key": "test-only-key",
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });
    expect(quoted.status).toBe(201);
    const { quote } = (await quoted.json()) as {
      quote: { id: string; estimateUsd: number; recipe: unknown };
    };
    expect(quote.recipe).toEqual({
      id: "flux-3-video",
      version: 1,
      route: "bfl",
    });
    expect(submissions).toBe(before);
    const spend = (id: string, body: object = input, quoteId = quote.id) =>
      call("/api/jobs", {
        method: "POST",
        headers: {
          cookie: session,
          "x-byo-key": "test-only-key",
          "idempotency-key": id,
          "quote-id": quoteId,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const results = await Promise.all([
      spend("worker-quoted"),
      spend("worker-quoted"),
    ]);
    const [first, second] = (await Promise.all(
      results.map((response) => response.json()),
    )) as { job: Job }[];
    expect(first.job.id).toBe(second.job.id);
    expect(first.job.costEstimateUsd).toBe(quote.estimateUsd);
    expect(submissions - before).toBe(1);
    const reused = await spend("worker-quoted-again");
    expect(reused.status).toBe(409);
    expect(((await reused.json()) as { code: string }).code).toBe("quote_used");
    const db = await mf.getD1Database("DB");
    const spent = await db
      .prepare("SELECT job FROM quotes WHERE id=?")
      .bind(quote.id)
      .first<{ job: string }>();
    expect(spent!.job).toBe(first.job.id);
    expect(
      (await spend("worker-mismatch", { ...input, duration: 10 })).status,
    ).toBe(409);
    await db
      .prepare("UPDATE quotes SET job=NULL, expires=0 WHERE id=?")
      .bind(quote.id)
      .run();
    const late = await spend("worker-late");
    expect(late.status).toBe(410);
    expect(((await late.json()) as { code: string }).code).toBe(
      "quote_expired",
    );
    expect(submissions - before).toBe(1);
  });
  it("never repeats an uncertain paid submission", async () => {
    faults.failSubmit = true;
    const before = submissions;
    const first = await post("worker-uncertain-test");
    expect(await first.json()).toMatchObject({ job: { status: "Error" } });
    await post("worker-uncertain-test");
    expect(submissions - before).toBe(1);
    faults.failSubmit = false;
  });
  it("matches replays by canonical settings rather than stored JSON text", async () => {
    const session = newSession();
    const before = submissions;
    const settings = { ...input, cameraText: "A slow clockwise arc." };
    expect((await post("canonical-replay", settings, session)).status).toBe(
      202,
    );
    // Same settings in a different key order are still the original request.
    const reordered = Object.fromEntries(Object.entries(settings).reverse());
    expect((await post("canonical-replay", reordered, session)).status).toBe(
      202,
    );
    // A field the original carried cannot silently vanish from a replay: the
    // default wording it falls back to is not what was submitted.
    const { cameraText: _dropped, ...without } = settings;
    expect((await post("canonical-replay", without, session)).status).toBe(409);
    expect(submissions - before).toBe(1);
  });
  it("replays a run recorded while Audio was a switch, whatever it said", async () => {
    const session = newSession();
    const before = submissions;
    const first = (await (
      await post("audio-era-replay", input, session)
    ).json()) as { job: { id: string } };
    // What a row recorded before audio was always on holds.
    const db = await mf.getD1Database("DB");
    await db
      .prepare(
        "UPDATE jobs SET input = json_set(input, '$.audio', json('false')) WHERE idempotency = ?",
      )
      .bind("audio-era-replay")
      .run();
    for (const body of [input, { ...input, audio: false }]) {
      const replay = await post("audio-era-replay", body, session);
      expect(replay.status).toBe(202);
      expect(((await replay.json()) as { job: { id: string } }).job.id).toBe(
        first.job.id,
      );
    }
    expect(submissions - before).toBe(1);
  });
  it("keeps a terminal's take out of another session's history and media", async () => {
    // The local server lists a terminal's or an agent's take in the studio
    // (`server/shared-takes.ts`); the hosted Worker stays strictly per visitor.
    const terminal = newSession();
    const made = await call("/api/jobs", {
      method: "POST",
      headers: {
        cookie: terminal,
        "x-byo-key": "test-only-key",
        "idempotency-key": "worker-terminal-take",
        "content-type": "application/json",
        "X-Genobi-Client": "cli",
      },
      body: JSON.stringify(input),
    });
    const { job } = (await made.json()) as { job: Job };
    const polled = await call(`/api/jobs/${job.id}`, {
      headers: { cookie: terminal, "x-byo-key": "test-only-key" },
    });
    const ready = ((await polled.json()) as { job: Job }).job;
    expect(ready.status).toBe("Ready");
    expect(ready.origin).toBeUndefined();
    expect(ready.shared).toBeUndefined();
    const visitor = newSession();
    const history = (await (
      await call("/api/history", { headers: { cookie: visitor } })
    ).json()) as { jobs: Job[] };
    expect(history.jobs).toEqual([]);
    for (const route of [`/api/clips/${job.id}`, `/api/takes/${job.id}`])
      expect((await call(route, { headers: { cookie: visitor } })).status).toBe(
        404,
      );
  });
});
