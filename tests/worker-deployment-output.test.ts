import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SESSION_STORAGE_BYTES } from "../shared/lifecycle";
import type { Job } from "../shared/types";
import { deploymentRequests } from "./worker-deploy-provider";
import {
  call,
  input,
  mf,
  newSession,
  useWorker,
  type TestBucket,
} from "./worker-harness";

useWorker();

/** An already submitted job at the copy step; the fake provider serves bytes only. */
async function copying() {
  const cookie = newSession();
  const session = cookie.slice(15);
  const id = crypto.randomUUID();
  const audioId = `${id}-audio-13`;
  const key = `${session}/${audioId}.audio`;
  const db = await mf.getD1Database("DB");
  const bucket = (await mf.getR2Bucket("MEDIA")) as unknown as TestBucket;
  const job = {
    ...input,
    model: "ltx-deploy-layout-to-video",
    id,
    status: "copying",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    costEstimateUsd: 0,
    keyMode: "byo",
  };
  await db
    .prepare(
      `INSERT INTO jobs(id,session,idempotency,input,data,take,remote_url,created_at)
      VALUES(?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      session,
      id,
      JSON.stringify(input),
      JSON.stringify(job),
      JSON.stringify({
        recipe: {
          id: job.model,
          version: 1,
          route: "workflow",
          location: "deployment",
          workflow: "world-builder-l2r-a2v",
          deployment: {
            url: "https://caller-owned.run.comfy.app",
            name: "caller-owned",
          },
        },
        inputs: [],
      }),
      "https://deployment-delivery.bfl.ai/clip.mp4",
      Date.now(),
    )
    .run();
  await db
    .prepare("INSERT INTO deployment_outputs(job,data,expires) VALUES(?,?,?)")
    .bind(
      id,
      JSON.stringify([
        {
          nodeId: "13",
          label: "Room wet mix",
          url: "https://deployment-delivery.bfl.ai/wet.wav",
        },
      ]),
      Date.now() + 7200000,
    )
    .run();
  const poll = async () => {
    const response = await call(`/api/jobs/${id}`, {
      headers: { cookie, "x-byo-key": "comfyui-deployment-test-key" },
    });
    const body = (await response.json()) as { job: Job };
    expect(response.status, JSON.stringify(body)).toBe(200);
    return body.job;
  };
  const ready = async () => {
    expect((await poll()).status).toBe("Ready");
    const audio = await call(`/api/clips/${audioId}`, { headers: { cookie } });
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toBe("audio/wav");
    expect((await audio.arrayBuffer()).byteLength).toBeGreaterThan(44);
    expect(
      await db
        .prepare("SELECT job FROM deployment_outputs WHERE job=?")
        .bind(id)
        .first(),
    ).toBeNull();
    expect(deploymentRequests.filter((r) => r.method === "POST")).toEqual([]);
  };
  return { db, bucket, session, id, audioId, key, poll, ready };
}

describe("hosted companion source and object recovery", () => {
  it.each([false, true])(
    "recovers a source-write failure after insert: %s, retaining only published bytes",
    async (afterInsert) => {
      const s = await copying();
      if (afterInsert) {
        // The video stays below quota; adding audio triggers eviction. Its
        // failing delete happens after saveSource's separate audio INSERT.
        const bytes = (await readFile("tests/fixtures/metadata.mp4")).length;
        await s.bucket.put("quota-victim", new Uint8Array([0]));
        await s.db
          .prepare(
            "INSERT INTO sources(id,session,data,object_key,bytes,created_at) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            "quota-victim",
            s.session,
            "{}",
            "quota-victim",
            SESSION_STORAGE_BYTES - bytes - 1,
            Date.now() - 60_000,
          )
          .run();
      }
      await s.db
        .prepare(
          afterInsert
            ? `CREATE TRIGGER fail_audio_source BEFORE DELETE ON sources
              WHEN OLD.id='quota-victim'
              BEGIN SELECT RAISE(FAIL, 'injected eviction failure'); END`
            : `CREATE TRIGGER fail_audio_source BEFORE INSERT ON sources
              WHEN NEW.id LIKE '%-audio-13'
              BEGIN SELECT RAISE(FAIL, 'injected source insert failure'); END`,
        )
        .run();
      try {
        expect((await s.poll()).status).toBe("copying");
        const source = await s.db
          .prepare("SELECT id FROM sources WHERE id=? AND session=?")
          .bind(s.audioId, s.session)
          .first();
        expect(Boolean(source)).toBe(afterInsert);
        expect(Boolean(await s.bucket.head(s.key))).toBe(afterInsert);
        expect(
          await s.db
            .prepare("SELECT job FROM deployment_outputs WHERE job=?")
            .bind(s.id)
            .first(),
        ).toEqual({ job: s.id });
      } finally {
        await s.db.prepare("DROP TRIGGER fail_audio_source").run();
        await s.db
          .prepare("UPDATE jobs SET lease_until=0 WHERE id=?")
          .bind(s.id)
          .run();
      }
      await s.ready();
      const total = await s.db
        .prepare("SELECT SUM(bytes) AS n FROM sources WHERE session=?")
        .bind(s.session)
        .first<{ n: number }>();
      expect(total!.n).toBeLessThanOrEqual(SESSION_STORAGE_BYTES);
    },
  );

  it("repairs a persisted companion row whose R2 object is missing", async () => {
    const s = await copying();
    await s.db
      .prepare(
        "INSERT INTO sources(id,session,data,object_key,bytes,created_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        s.audioId,
        s.session,
        JSON.stringify({ contentType: "audio/wav", mediaType: "audio" }),
        s.key,
        16044,
        Date.now(),
      )
      .run();
    expect(await s.bucket.head(s.key)).toBeNull();
    await s.ready();
    expect(await s.bucket.head(s.key)).not.toBeNull();
  });
});
