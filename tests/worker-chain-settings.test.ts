import { describe, expect, it } from "vitest";
import type { ChainView } from "../shared/chain";
import { deploymentRequests } from "./worker-deploy-provider";
import {
  call,
  cloudRequests,
  input,
  mf,
  newSession,
  useWorker,
} from "./worker-harness";

useWorker();
const key = "comfyui-deployment-test-key";
const endpoint = "https://caller-owned.run.comfy.app";
const acoustic = {
  ...input,
  model: "ltx-2.5-akuspace",
  duration: 6,
  acoustic: { mode: "room", preset: "empty_club", level: "high" },
};
const headers = (session: string, withKey = true) => ({
  cookie: session,
  "content-type": "application/json",
  ...(withKey ? { "x-byo-key": key } : {}),
});
async function settings(session: string, body: object, workflow = false) {
  const response = await call(
    `/api/settings/${workflow ? "workflows/selection" : "run-location"}`,
    {
      method: "POST",
      headers: headers(session, false),
      body: JSON.stringify(body),
    },
  );
  expect(response.status).toBe(200);
}
async function create(session: string, stage: object = acoustic) {
  const response = await call("/api/chains", {
    method: "POST",
    headers: headers(session),
    body: JSON.stringify({ stages: [{ input: stage }] }),
  });
  const body = (await response.json()) as { chain: ChainView };
  expect(response.status, JSON.stringify(body)).toBe(201);
  return body.chain;
}
async function read(session: string, id: string, withKey = true) {
  const response = await call(`/api/chains/${id}`, {
    headers: headers(session, withKey),
  });
  const body = (await response.json()) as {
    chain: ChainView;
    needsKey?: boolean;
    pauseError?: { code: string };
  };
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body;
}
async function noRuns(session: string) {
  const db = await mf.getD1Database("DB");
  const jobs = await db
    .prepare("SELECT count(*) AS n FROM jobs WHERE session=?")
    .bind(session.slice(15))
    .first<{ n: number }>();
  expect(jobs?.n).toBe(0);
  expect(cloudRequests).toEqual([]);
  expect(deploymentRequests).toEqual([]);
}
async function layout(session: string) {
  await settings(session, { location: "deployment", deploymentUrl: endpoint });
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
        JSON.stringify({ __type: "core/ASSET", info: { id: `fake-${token}` } }),
        Date.now() + 7200000,
      )
      .run();
  }
  return {
    ...input,
    model: "ltx-deploy-layout-to-video",
    duration: 8,
    aspectRatio: "16:9",
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
      assets,
    },
  };
}

describe("hosted paused chains after a settings change", () => {
  it("refreshes the quote on Cloud/deployment and endpoint changes before approval", async () => {
    const session = newSession();
    const initial = await create(session);
    expect(initial.quote?.recipe).toMatchObject({
      location: "cloud",
      workflow: "ltx-2-5-akuspace-t2v",
    });
    let previous = initial.quote!.id;
    for (const deploymentUrl of [
      endpoint,
      "https://second-workspace.run.comfy.app",
      undefined,
    ]) {
      await settings(session, {
        location: deploymentUrl ? "deployment" : "cloud",
        ...(deploymentUrl ? { deploymentUrl } : {}),
      });
      const keyless = await read(session, initial.id, false);
      expect(keyless.needsKey).toBe(true);
      expect(keyless.chain.quote).toBeUndefined();
      const refreshed = await read(session, initial.id);
      expect(refreshed.chain).toMatchObject({ status: "paused", pausedAt: 0 });
      expect(refreshed.pauseError).toBeUndefined();
      expect(refreshed.chain.quote!.id).not.toBe(previous);
      expect(refreshed.chain.quote!.recipe).toMatchObject({
        location: deploymentUrl ? "deployment" : "cloud",
        workflow: "ltx-2-5-akuspace-t2v",
      });
      expect(refreshed.chain.quote!.recipe.deployment?.url).toBe(deploymentUrl);
      previous = refreshed.chain.quote!.id;
      // Stable settings keep the same unspent quote, without a retry or run.
      expect((await read(session, initial.id)).chain.quote!.id).toBe(previous);
    }
    expect(Date.parse(initial.quote!.expiresAt)).toBeGreaterThan(Date.now());
    await noRuns(session);
  });

  it("refreshes an unexpired preset quote and refuses approval of the old one", async () => {
    const session = newSession();
    const initial = await create(session, await layout(session));
    expect(initial.quote!.recipe.workflow).toBe("world-builder-l2r-a2v");
    await settings(
      session,
      {
        entry: "ltx-deploy-layout-to-video",
        template: "world-builder-l2r-a2v-studio",
      },
      true,
    );
    const refreshed = await read(session, initial.id);
    expect(refreshed.chain).toMatchObject({ status: "paused", pausedAt: 0 });
    expect(refreshed.chain.quote!.id).not.toBe(initial.quote!.id);
    expect(refreshed.chain.quote!.recipe).toMatchObject({
      location: "deployment",
      workflow: "world-builder-l2r-a2v-studio",
      deployment: { url: endpoint },
    });
    expect(Date.parse(initial.quote!.expiresAt)).toBeGreaterThan(Date.now());
    const refused = await call(`/api/chains/${initial.id}/approve`, {
      method: "POST",
      headers: { ...headers(session), "quote-id": initial.quote!.id },
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "quote_mismatch" });
    expect((await read(session, initial.id)).chain.quote!.id).toBe(
      refreshed.chain.quote!.id,
    );
    await noRuns(session);
  });

  it("hides an unusable quote and explains a removed required deployment", async () => {
    const session = newSession();
    const initial = await create(session, await layout(session));
    await settings(session, { location: "cloud" });
    const refreshed = await read(session, initial.id);
    expect(refreshed.chain).toMatchObject({ status: "paused", pausedAt: 0 });
    expect(refreshed.chain.quote).toBeUndefined();
    expect(refreshed.pauseError).toMatchObject({
      code: "invalid_deployment_input",
    });
    await noRuns(session);
  });
});
