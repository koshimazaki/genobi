import { describe, expect, it } from "vitest";
import { MAX_DEPLOYMENT_SETTINGS, RATE_LIMITS } from "../shared/limits";
import {
  call,
  cloudRequests,
  mf,
  newSession,
  useWorker,
} from "./worker-harness";

useWorker();
const endpoint = "https://caller-owned.run.comfy.app";
const save = (
  session: string,
  body: object,
  headers: Record<string, string> = {},
) =>
  call("/api/settings/run-location", {
    method: "POST",
    headers: {
      cookie: session,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
const deploy = { location: "deployment", deploymentUrl: endpoint };

describe("hosted deployment settings bounds", () => {
  it("does not persist an unchanged default Cloud setting", async () => {
    const session = newSession();
    expect((await save(session, { location: "cloud" })).status).toBe(200);
    const db = await mf.getD1Database("DB");
    expect(
      await db
        .prepare("SELECT session FROM deployment_settings WHERE session=?")
        .bind(session.slice(15))
        .first(),
    ).toBeNull();
  });

  it("limits one IP even when every settings write uses a fresh session", async () => {
    const headers = { "cf-connecting-ip": "198.51.100.10" };
    for (let i = 0; i < RATE_LIMITS.settingsPerIp; i++)
      expect((await save(newSession(), deploy, headers)).status).toBe(200);
    expect((await save(newSession(), deploy, headers)).status).toBe(429);
    // The limiter is specific to the caller, not a lock on every visitor.
    expect(
      (
        await save(newSession(), deploy, {
          "cf-connecting-ip": "198.51.100.11",
        })
      ).status,
    ).toBe(200);
  });

  it("limits aggregate settings writes before creating session state", async () => {
    const db = await mf.getD1Database("DB");
    const id = "settingsGlobal:deployment-settings";
    await db
      .prepare(
        "INSERT OR REPLACE INTO rate_limits(id,starts,count) VALUES(?,?,?)",
      )
      .bind(id, Date.now(), RATE_LIMITS.settingsGlobal)
      .run();
    try {
      const session = newSession();
      expect((await save(session, deploy)).status).toBe(429);
      expect(
        await db
          .prepare("SELECT session FROM deployment_settings WHERE session=?")
          .bind(session.slice(15))
          .first(),
      ).toBeNull();
    } finally {
      await db.prepare("DELETE FROM rate_limits WHERE id=?").bind(id).run();
    }
  });

  it("bounds stored configurations atomically, displacing the oldest rather than refusing", async () => {
    const db = await mf.getD1Database("DB");
    await db.prepare("DELETE FROM deployment_settings").run();
    const existing = newSession();
    await save(existing, deploy);
    await db
      .prepare(
        `WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<?)
        INSERT INTO deployment_settings(session,url,revision,updated_at)
        SELECT 'capacity-' || x, ?, 1, ? - x FROM n`,
      )
      .bind(MAX_DEPLOYMENT_SETTINGS - 2, endpoint, Date.now() - 1)
      .run();
    try {
      const results = await Promise.all([
        save(newSession(), deploy),
        save(newSession(), deploy),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect((await save(existing, { location: "cloud" })).status).toBe(200);
      expect(
        await db
          .prepare("SELECT count(*) AS n FROM deployment_settings")
          .first(),
      ).toEqual({ n: MAX_DEPLOYMENT_SETTINGS });
      // The least recently saved row went; the existing session stayed.
      const oldest = `capacity-${MAX_DEPLOYMENT_SETTINGS - 2}`;
      expect(
        await db
          .prepare("SELECT session FROM deployment_settings WHERE session=?")
          .bind(oldest)
          .first(),
      ).toBeNull();
      expect(
        await db
          .prepare("SELECT session FROM deployment_settings WHERE session=?")
          .bind(existing.slice(15))
          .first(),
      ).not.toBeNull();
    } finally {
      await db.prepare("DELETE FROM deployment_settings").run();
    }
  });

  it("rejects a chunked settings body over 2 KB before it can write state", async () => {
    const session = newSession();
    const bytes = new TextEncoder().encode(
      " ".repeat(2048) + JSON.stringify(deploy),
    );
    const response = await mf.dispatchFetch(
      "https://studio.test/api/settings/run-location",
      {
        method: "POST",
        duplex: "half",
        headers: {
          cookie: session,
          "content-type": "application/json",
          "cf-connecting-ip": "198.51.100.12",
        },
        body: (async function* () {
          yield bytes.subarray(0, 1024);
          yield bytes.subarray(1024);
        })(),
      },
    );
    expect(response.status).toBe(413);
    const db = await mf.getD1Database("DB");
    expect(
      await db
        .prepare("SELECT session FROM deployment_settings WHERE session=?")
        .bind(session.slice(15))
        .first(),
    ).toBeNull();
  });
});

describe("hosted Cloud workflow expectations", () => {
  const input = {
    generator: "image",
    model: "flux-3-klein",
    description: "A blue sphere.",
    imageAspectRatio: "1:1",
    imageResolution: "1k",
  };
  it("rejects mismatched location and workflow on quotes and direct submissions", async () => {
    const before = cloudRequests.length;
    const expectations: Record<string, string>[] = [
      { "genobi-run-location": "local" },
      { "genobi-run-location": "deployment" },
      { "genobi-workflow": "world-builder-l2r-a2v" },
    ];
    for (const expected of expectations)
      for (const route of ["quotes", "jobs"]) {
        const response = await call(`/api/${route}`, {
          method: "POST",
          headers: {
            cookie: newSession(),
            "content-type": "application/json",
            "x-byo-key": "comfyui-worker-test-key",
            "idempotency-key": crypto.randomUUID(),
            ...expected,
          },
          body: JSON.stringify(input),
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          code: "settings_changed",
        });
      }
    expect(cloudRequests).toHaveLength(before);
  });

  it("records an explicit Cloud plan and accepts its matching quote", async () => {
    const session = newSession();
    const headers = {
      cookie: session,
      "content-type": "application/json",
      "x-byo-key": "comfyui-worker-test-key",
      "genobi-run-location": "cloud",
      "genobi-workflow": "flux-3-klein-t2i",
    };
    const response = await call("/api/quotes", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(201);
    const { quote } = (await response.json()) as {
      quote: { id: string; recipe: unknown };
    };
    expect(quote.recipe).toMatchObject({
      location: "cloud",
      workflow: "flux-3-klein-t2i",
    });
    const submitted = await call("/api/jobs", {
      method: "POST",
      headers: {
        ...headers,
        "quote-id": quote.id,
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify(input),
    });
    expect(submitted.status).toBe(202);
    expect(await submitted.json()).toMatchObject({
      job: { status: "Pending" },
    });
  });
});
