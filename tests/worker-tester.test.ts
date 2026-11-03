// Hosted tester access with every secret set: isolated D1/R2 and the fake
// deployment, so no run here reaches a real provider or spends anything.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  call,
  mf,
  newSession,
  routerRequests,
  useWorker,
} from "./worker-harness";
import { deploymentRequests } from "./worker-deploy-provider";
import type { Job } from "../shared/types";

// Test-only values: the real code goes in the submission form, never here.
const CODE = "test-only-access-code-7f3a";
const OWNER = "https://owner-test.run.comfy.app";
useWorker({
  TESTER_ACCESS_CODE: CODE,
  TESTER_TOKEN_SECRET: "test-only-token-secret-0123456789abcdef",
  TESTER_COMFY_KEY: "comfyui-deployment-test-key",
  TESTER_DEPLOYMENT_URL: OWNER,
  TESTER_RUN_CAP: "3",
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
const unlock = (session: string, code: string) =>
  call("/api/tester/unlock", {
    method: "POST",
    headers: { cookie: session, "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
async function unlocked(session: string) {
  const response = await unlock(session, CODE);
  const data = (await response.json()) as { token: string; runsLeft: number };
  expect(response.status, JSON.stringify(data)).toBe(200);
  return data;
}
/** Owned input tickets on the operator's endpoint, as staging would leave them. */
async function staged(session: string, url = OWNER) {
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
        url,
        token,
        JSON.stringify({ __type: "core/ASSET", info: { id: `f-${token}` } }),
        Date.now() + 7200000,
      )
      .run();
  }
  return { ...input, deploy: { ...input.deploy, assets } };
}
const headers = (session: string, token: string) => ({
  cookie: session,
  "content-type": "application/json",
  "x-byo-key": token,
});
const quote = (session: string, token: string, body: object) =>
  call("/api/quotes", {
    method: "POST",
    headers: headers(session, token),
    body: JSON.stringify(body),
  });
const submit = (session: string, token: string, body: object, id: string) =>
  call("/api/jobs", {
    method: "POST",
    headers: {
      ...headers(session, token),
      "idempotency-key": crypto.randomUUID(),
      "quote-id": id,
    },
    body: JSON.stringify(body),
  });
async function quoted(session: string, token: string, body: object) {
  const response = await quote(session, token, body);
  const data = (await response.json()) as { quote: { id: string } };
  expect(response.status, JSON.stringify(data)).toBe(201);
  return data.quote.id;
}
const runsLeft = async (session: string, token: string) =>
  (
    (await (
      await call("/api/tester/status", { headers: headers(session, token) })
    ).json()) as { runsLeft: number }
  ).runsLeft;
const jobPosts = () =>
  deploymentRequests.filter(
    (r) => r.method === "POST" && r.path === "/api/v2/jobs",
  );

// Everything the runtime prints while these tests run, to prove the code never appears.
let printed = "";
beforeEach(() => {
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream);
    vi.spyOn(stream, "write").mockImplementation((chunk, ...rest) => {
      printed += String(chunk);
      return (write as (...a: unknown[]) => boolean)(chunk, ...rest);
    });
  }
});
afterEach(() => vi.restoreAllMocks());

describe("hosted tester access", () => {
  it("is announced by health and refuses a wrong code with a bare 401, then rate-limits", async () => {
    const health = (await (await call("/api/health")).json()) as object;
    expect(health).toMatchObject({ testerAccess: true });
    const session = newSession();
    for (let i = 0; i < 5; i++) {
      const response = await unlock(session, `wrong-code-${i}-xxxxxx`);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: "Access code not accepted.",
        code: "tester_refused",
      });
    }
    expect((await unlock(session, CODE)).status).toBe(429);
  });
  it("returns a session-bound token for the right code and registers the operator endpoint", async () => {
    const session = newSession();
    const { token, runsLeft: left } = await unlocked(session);
    expect(token.startsWith("comfyui-tester.")).toBe(true);
    expect(token).not.toContain(CODE);
    expect(left).toBe(3);
    const state = await (
      await call("/api/settings/run-location", { headers: { cookie: session } })
    ).json();
    expect(state).toMatchObject({
      location: "deployment",
      deployment: { url: OWNER },
    });
    // Another session cannot use it.
    const other = newSession();
    expect((await quote(other, token, await staged(other))).status).toBe(401);
    // A tampered token is refused the same way.
    expect(
      (await quote(session, `${token}x`, await staged(session))).status,
    ).toBe(401);
  });
  it("keeps the operator key off every route but the deployment ones", async () => {
    const session = newSession();
    const { token } = await unlocked(session);
    const credits = (await (
      await call("/api/credits", { headers: headers(session, token) })
    ).json()) as { credits: unknown };
    expect(credits.credits).toBeNull();
    const routerBefore = routerRequests.length;
    const router = await quote(session, token, {
      ...input,
      model: "ltx-2-5-fast",
      deploy: undefined,
    });
    expect(router.status).not.toBe(201);
    expect(routerRequests).toHaveLength(routerBefore);
    // A visitor-registered endpoint never receives the operator's key.
    await call("/api/settings/run-location", {
      method: "POST",
      headers: { cookie: session, "content-type": "application/json" },
      body: JSON.stringify({
        location: "deployment",
        deploymentUrl: "https://visitor-owned.run.comfy.app",
      }),
    });
    const before = deploymentRequests.length;
    const foreign = await quote(
      session,
      token,
      await staged(session, "https://visitor-owned.run.comfy.app"),
    );
    expect(foreign.status).toBe(403);
    const upload = await call("/api/settings/deployment-assets/TAKE_WEBM", {
      method: "POST",
      headers: { ...headers(session, token), "content-type": "video/webm" },
      body: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]),
    });
    expect(upload.status).toBe(403);
    expect(deploymentRequests).toHaveLength(before);
  });
  it("counts a run at reservation, polls on the operator endpoint and refuses at the cap", async () => {
    const session = newSession();
    const { token } = await unlocked(session);
    const body = await staged(session);
    const posts = jobPosts().length;
    const first = await submit(
      session,
      token,
      body,
      await quoted(session, token, body),
    );
    expect(first.status).toBe(202);
    const { job } = (await first.json()) as { job: Job };
    expect(await runsLeft(session, token)).toBe(2);
    const polled = (await (
      await call(`/api/jobs/${job.id}`, { headers: headers(session, token) })
    ).json()) as { job: Job };
    expect(polled.job.status, JSON.stringify(polled)).toBe("Ready");
    expect(
      deploymentRequests
        .slice(-4)
        .every((r) => r.host === "owner-test.run.comfy.app" && r.authorised),
    ).toBe(true);
    // Two quotes for the last run: only one of them can reserve it.
    const second = newSession();
    const other = await unlocked(second);
    const otherBody = await staged(second);
    expect(
      (
        await submit(
          second,
          other.token,
          otherBody,
          await quoted(second, other.token, otherBody),
        )
      ).status,
    ).toBe(202);
    const a = await quoted(session, token, body);
    const b = await quoted(session, token, body);
    const results = await Promise.all([
      submit(session, token, body, a),
      submit(session, token, body, b),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([202, 403]);
    const refused = results.find((r) => r.status === 403)!;
    expect(((await refused.json()) as { error: string }).error).toBe(
      "Test runs used up.",
    );
    expect(jobPosts()).toHaveLength(posts + 3);
    expect(await runsLeft(session, token)).toBe(0);
    const late = await quote(session, token, body);
    expect(late.status).toBe(403);
    expect(((await late.json()) as { error: string }).error).toBe(
      "Test runs used up.",
    );
  });
  it("never stores or prints the access code", async () => {
    const db = await mf.getD1Database("DB");
    const tables = await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
      )
      .all<{ name: string }>();
    let stored = "";
    for (const { name } of tables.results)
      stored += JSON.stringify(
        (await db.prepare(`SELECT * FROM "${name}"`).all()).results,
      );
    expect(stored).not.toContain(CODE);
    expect(stored).not.toContain("comfyui-tester.");
    expect(stored).not.toContain("comfyui-deployment-test-key");
    expect(
      (
        await db
          .prepare("SELECT count(*) AS n FROM tester_runs")
          .first<{ n: number }>()
      )?.n,
    ).toBe(1);
    expect(printed).not.toContain(CODE);
  });
});
