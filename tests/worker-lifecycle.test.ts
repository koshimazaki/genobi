import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { RETENTION_MS, SESSION_STORAGE_BYTES } from "../shared/lifecycle";
import { RATE_LIMITS } from "../shared/limits";
import { rollUpDailyStats } from "../observability/rollup";
import type { Job } from "../shared/types";
import {
  applyPersistedMediaState,
  MEDIA_UNAVAILABLE_MESSAGE,
  SAVE_JOB_SQL,
} from "../shared/job-storage";
import {
  mf,
  submissions,
  cookie,
  input,
  call,
  newSession,
  post,
  insertStaleJob,
  useWorker,
  type TestDatabase,
  type TestBucket,
  type CronTrigger,
} from "./worker-harness";

// Lifecycle through the Worker: expiry, the scheduled sweep and its counts,
// storage eviction, and the read-route rate limit.
useWorker();

describe("Cloudflare adapter lifecycle: expiry, sweep, eviction and read limits", () => {
  it("ages out a job no browser came back for", async () => {
    const db = await mf.getD1Database("DB");
    const session = cookie.slice("camera_session=".length);
    await insertStaleJob(db, session, "read-stale");
    const response = await call("/api/jobs/read-stale", {
      headers: { "x-byo-key": "test-only-key" },
    });
    const { job } = (await response.json()) as { job: Job };
    // A returning tab reaches the same verdict the background sweep would.
    expect(job.status).toBe("expired");
    expect(job.error).toContain("30-minute");
  });
  it("sweeps abandoned jobs and dead rows with no visitor present", async () => {
    const db = await mf.getD1Database("DB");
    const session = cookie.slice("camera_session=".length);
    await insertStaleJob(db, session, "swept-job");
    // Past retention, and interrupted after its copy but before its source row.
    await insertStaleJob(
      db,
      session,
      "retired-job",
      RETENTION_MS + 1000,
      "copying",
    );
    const media = (await mf.getBindings<{ MEDIA: TestBucket }>()).MEDIA;
    await media.put(`${session}/retired-job.mp4`, new Uint8Array([0, 1, 2]));
    await db.batch([
      db.prepare(
        "INSERT INTO shares (token,object_key,expires) VALUES ('dead-token','x/y.mp4',1)",
      ),
      db.prepare(
        "INSERT INTO rate_limits (id,starts,count) VALUES ('closed:window',1,5)",
      ),
      db.prepare(
        "INSERT INTO quotes (id,session,settings,data,expires) VALUES ('dead-quote','s','h','{}',1)",
      ),
      // Release any claim an earlier request already took for this interval.
      db.prepare("DELETE FROM rate_limits WHERE id='sweep'"),
    ]);
    const worker = (await mf.getWorker()) as unknown as CronTrigger;
    expect(
      await worker.scheduled({
        scheduledTime: new Date(),
        cron: "*/5 * * * *",
      }),
    ).toMatchObject({ outcome: "ok" });
    const swept = await db
      .prepare("SELECT data FROM jobs WHERE id='swept-job'")
      .first<{ data: string }>();
    expect((JSON.parse(swept!.data) as Job).status).toBe("expired");
    const counts = async (sql: string) =>
      (await db.prepare(sql).first<{ n: number }>())!.n;
    expect(
      await counts("SELECT COUNT(*) AS n FROM shares WHERE token='dead-token'"),
    ).toBe(0);
    expect(
      await counts(
        "SELECT COUNT(*) AS n FROM rate_limits WHERE id='closed:window'",
      ),
    ).toBe(0);
    expect(
      await counts("SELECT COUNT(*) AS n FROM quotes WHERE id='dead-quote'"),
    ).toBe(0);
    // The claim row is a schedule, not a counter, so cleanup must spare it.
    expect(
      await counts("SELECT COUNT(*) AS n FROM rate_limits WHERE id='sweep'"),
    ).toBe(1);
    // Retention removes the record and the object nothing else points at.
    expect(
      await counts("SELECT COUNT(*) AS n FROM jobs WHERE id='retired-job'"),
    ).toBe(0);
    expect(await media.head(`${session}/retired-job.mp4`)).toBe(null);
    // Its count survives the row: the rollup runs before anything is deleted.
    const retiredDay = new Date(Date.now() - RETENTION_MS - 1000)
      .toISOString()
      .slice(0, 10);
    const frozen = await db
      .prepare("SELECT generations FROM daily_stats WHERE day=?")
      .bind(retiredDay)
      .first<{ generations: number }>();
    expect(frozen?.generations).toBeGreaterThanOrEqual(1);
    // A second pass over a day with no detail left must not lower it.
    await db.prepare("DELETE FROM rate_limits WHERE id='sweep'").run();
    await worker.scheduled({ scheduledTime: new Date(), cron: "*/5 * * * *" });
    expect(
      (
        await db
          .prepare("SELECT generations FROM daily_stats WHERE day=?")
          .bind(retiredDay)
          .first<{ generations: number }>()
      )?.generations,
    ).toBe(frozen?.generations);
    // A five-minute sweep must not rewrite unchanged daily_stats rows.
    const idleChanges = await rollUpDailyStats({ DB: db });
    expect(idleChanges).toBe(0);
    // Counts only: the rollup stores nothing about what was generated.
    const columns = await db.prepare("SELECT * FROM daily_stats LIMIT 1").all();
    expect(Object.keys(columns.results[0] ?? {})).toEqual([
      "day",
      "generations",
      "sessions",
      "ready",
      "failed",
      "drafts",
      "upscales",
      "spend_usd",
    ]);
  });
  it("evicts a visitor's oldest clips once they pass the storage ceiling", async () => {
    const db = await mf.getD1Database("DB");
    const media = (await mf.getBindings<{ MEDIA: TestBucket }>()).MEDIA;
    const session = randomUUID();
    // Three stored clips that already fill the ceiling, oldest first.
    const clips = ["oldest", "middle", "newest"];
    for (const [index, id] of clips.entries()) {
      await media.put(`${session}/${id}.mp4`, new Uint8Array([index]));
      await db.batch([
        db
          .prepare(
            "INSERT INTO sources (id,session,data,object_key,bytes,created_at) VALUES (?,?,?,?,?,?)",
          )
          .bind(
            id,
            session,
            JSON.stringify({
              id,
              url: `/api/clips/${id}`,
              origin: "generated",
            }),
            `${session}/${id}.mp4`,
            SESSION_STORAGE_BYTES * 0.4,
            Date.now() - (clips.length - index) * 1000,
          ),
        // Each generated clip has a job row sharing its id.
        db
          .prepare(
            "INSERT INTO jobs (id,session,idempotency,input,data,created_at) VALUES (?,?,?,?,?,?)",
          )
          .bind(id, session, `${id}-key`, "{}", "{}", Date.now()),
      ]);
    }
    // Uploading one more grows storage, which is what enforces the ceiling.
    const bytes = await readFile("tests/fixtures/metadata.mp4");
    const cookie = `camera_session=${session}`;
    const upload = await call("/api/uploads?filename=quota.mp4", {
      method: "POST",
      headers: {
        cookie,
        "x-byo-key": "test-only-key",
        "content-type": "video/mp4",
        "content-length": String(bytes.length),
      },
      body: bytes,
    });
    expect(upload.status).toBe(201);
    const remaining = await db
      .prepare("SELECT id FROM sources WHERE session=? ORDER BY created_at")
      .bind(session)
      .all<{ id: string }>();
    // The oldest went; the newest and the arrival stayed.
    expect(remaining.results.map((row: { id: string }) => row.id)).toEqual([
      "middle",
      "newest",
      expect.any(String),
    ]);
    const arrival = remaining.results.at(-1)!.id;
    expect(await media.head(`${session}/oldest.mp4`)).toBe(null);
    // The run and idempotency reservation remain for replay safety and stats,
    // while its public record says the media is no longer available.
    const evictedJob = await db
      .prepare("SELECT data FROM jobs WHERE id='oldest'")
      .first<{ data: string }>();
    expect(evictedJob).not.toBeNull();
    expect(JSON.parse(evictedJob!.data)).toMatchObject({
      mediaAvailable: false,
    });
    const stored = async () =>
      (await db
        .prepare(
          "SELECT COALESCE(SUM(bytes),0) AS bytes FROM sources WHERE session=?",
        )
        .bind(session)
        .first<{ bytes: number }>())!.bytes;
    expect(await stored()).toBeLessThanOrEqual(SESSION_STORAGE_BYTES);

    // A clip larger than the whole ceiling still cannot cost a visitor the one
    // that just arrived: eviction always leaves the newest in place.
    await db
      .prepare("UPDATE sources SET bytes=? WHERE id=?")
      .bind(SESSION_STORAGE_BYTES * 2, "middle")
      .run();
    const second = await call("/api/uploads?filename=quota-again.mp4", {
      method: "POST",
      headers: {
        cookie,
        "x-byo-key": "test-only-key",
        "content-type": "video/mp4",
        "content-length": String(bytes.length),
      },
      body: bytes,
    });
    expect(second.status).toBe(201);
    const after = await db
      .prepare("SELECT id FROM sources WHERE session=? ORDER BY created_at")
      .bind(session)
      .all<{ id: string }>();
    const kept = after.results.map((row: { id: string }) => row.id);
    expect(kept).not.toContain("middle");
    expect(kept).toContain(arrival);
    expect(kept.at(-1)).toBe(
      ((await second.json()) as { source: { id: string } }).source.id,
    );
    expect(await stored()).toBeLessThanOrEqual(SESSION_STORAGE_BYTES);
  });

  it("keeps an evicted generation deduplicated and counted after later same-day work", async () => {
    const db = await mf.getD1Database("DB");
    const media = (await mf.getBindings<{ MEDIA: TestBucket }>()).MEDIA;
    const sessionCookie = newSession();
    const session = sessionCookie.slice("camera_session=".length);
    const key = `eviction-replay-${randomUUID()}`;
    const before = submissions;
    const submitted = await post(key, input, sessionCookie);
    const original = (await submitted.json()) as { job: Job };
    await call(`/api/jobs/${original.job.id}`, {
      headers: {
        cookie: sessionCookie,
        "x-byo-key": "test-only-key",
      },
    });
    await db
      .prepare("UPDATE sources SET bytes=? WHERE id=?")
      .bind(SESSION_STORAGE_BYTES, original.job.id)
      .run();

    const bytes = await readFile("tests/fixtures/metadata.mp4");
    expect(
      (
        await call("/api/uploads?filename=quota-replay.mp4", {
          method: "POST",
          headers: {
            cookie: sessionCookie,
            "x-byo-key": "test-only-key",
            "content-type": "video/mp4",
            "content-length": String(bytes.length),
          },
          body: bytes,
        })
      ).status,
    ).toBe(201);
    expect(await media.head(`${session}/${original.job.id}.mp4`)).toBe(null);

    const replay = (await (await post(key, input, sessionCookie)).json()) as {
      job: Job;
    };
    expect(replay.job.id).toBe(original.job.id);
    expect(replay.job).toMatchObject({
      status: "Ready",
      mediaAvailable: false,
    });
    expect(replay.job.resultUrl).toBeUndefined();
    expect(submissions - before).toBe(1);

    const later = (await (
      await post(`later-${randomUUID()}`, input, sessionCookie)
    ).json()) as { job: Job };
    await call(`/api/jobs/${later.job.id}`, {
      headers: {
        cookie: sessionCookie,
        "x-byo-key": "test-only-key",
      },
    });
    const day = new Date().toISOString().slice(0, 10);
    const expected = await db
      .prepare(
        `SELECT COUNT(*) AS generations,
        SUM(json_extract(data,'$.status')='Ready') AS ready,
        ROUND(SUM(COALESCE(json_extract(data,'$.costActualUsd'),json_extract(data,'$.costEstimateUsd'),0)),4) AS spend_usd
        FROM jobs WHERE date(created_at/1000,'unixepoch')=?`,
      )
      .bind(day)
      .first<{ generations: number; ready: number; spend_usd: number }>();
    await db.prepare("DELETE FROM rate_limits WHERE id='sweep'").run();
    const worker = (await mf.getWorker()) as unknown as CronTrigger;
    await worker.scheduled({ scheduledTime: new Date(), cron: "*/5 * * * *" });
    expect(
      await db
        .prepare(
          "SELECT generations,ready,spend_usd FROM daily_stats WHERE day=?",
        )
        .bind(day)
        .first(),
    ).toEqual(expected);
  });

  it("keeps an eviction marker when a stale Ready save finishes afterward", async () => {
    const bindings = await mf.getBindings<{ DB: TestDatabase }>();
    const id = randomUUID();
    const session = randomUUID();
    const stored = {
      ...input,
      aspectRatio: "16:9" as const,
      upscaleCreativity: 0 as const,
      id,
      prompt: "A ceramic vessel.",
      status: "copying",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      costEstimateUsd: 0.85,
      costActualUsd: 0.85,
      keyMode: "byo",
      mediaAvailable: false,
      error: MEDIA_UNAVAILABLE_MESSAGE,
    } satisfies Job;
    await bindings.DB.prepare(
      "INSERT INTO jobs (id,session,idempotency,input,data,created_at) VALUES (?,?,?,?,?,?)",
    )
      .bind(
        id,
        session,
        randomUUID(),
        JSON.stringify(input),
        JSON.stringify(stored),
        Date.now(),
      )
      .run();
    const stale = {
      ...stored,
      status: "Ready" as const,
      resultUrl: `/api/clips/${id}`,
      mediaAvailable: undefined,
      error: undefined,
    };
    const incoming = JSON.stringify(stale);
    const saved = await bindings.DB.prepare(SAVE_JOB_SQL)
      .bind(
        incoming,
        MEDIA_UNAVAILABLE_MESSAGE,
        incoming,
        null,
        null,
        id,
        session,
      )
      .first<{ data: string }>();
    applyPersistedMediaState(stale, JSON.parse(saved!.data) as Job);
    expect(stale).toMatchObject({
      status: "Ready",
      mediaAvailable: false,
      error: MEDIA_UNAVAILABLE_MESSAGE,
    });
    expect(stale.resultUrl).toBeUndefined();
    const persisted = await bindings.DB.prepare(
      "SELECT data FROM jobs WHERE id=?",
    )
      .bind(id)
      .first<{ data: string }>();
    expect(JSON.parse(persisted!.data)).toMatchObject(stale);
  });
  it("gives read routes a ceiling, not just the paid writes", async () => {
    // Its own session, so the limit under test cannot leak into other cases.
    const isolated = `camera_session=${randomUUID()}`;
    const seen = new Set<number>();
    for (let attempt = 0; attempt <= RATE_LIMITS.poll; attempt++)
      seen.add(
        (await call("/api/jobs/no-such-job", { headers: { cookie: isolated } }))
          .status,
      );
    // Every allowed request reached the handler; the last one never did.
    expect(seen).toEqual(new Set([404, 429]));
  });
});
