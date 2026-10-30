import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalComfyWorkflows } from "../server/comfy-local";
import { ServerKeys } from "../server/keys";
import { WorkflowDestinations } from "../server/workflow-destinations";
import { seedvr2Workflow } from "../shared/comfy/seedvr2";
import type { WorkflowClient } from "../shared/comfy/workflow";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";
import { hasFfmpeg } from "./ffmpeg-harness";
import { input, setup } from "./server-harness";

// SeedVR2 parts on a local ComfyUI with no key anywhere: the set quotes $0,
// and one confirmation sends each part once to the local ComfyUI, never to
// Cloud. Real ffmpeg cuts the clip; skipped where it is missing.
let fake: FakeComfy | undefined;
const folders: string[] = [];
afterEach(async () => {
  await fake?.close();
  fake = undefined;
  for (const folder of folders.splice(0))
    await rm(folder, { recursive: true, force: true });
});

describe("a split SeedVR2 upscale on a local ComfyUI", () => {
  it.skipIf(!hasFfmpeg)(
    "quotes $0 and sends each part once, keyless",
    async () => {
      fake = await fakeComfy({ nodes: nodesFor(seedvr2Workflow.graph) });
      let cloudRuns = 0;
      const cloud: WorkflowClient = {
        run: async () => {
          cloudRuns++;
          return "https://cloud.comfy.org/api/v2/jobs/cloud-1";
        },
        poll: async () => ({ id: "cloud-1", status: "Generating" }),
        download: async () => new Response(),
      };
      const local = new LocalComfyWorkflows({ url: fake.url });
      const app = await setup(
        undefined,
        new WorkflowDestinations(cloud, local),
        { destination: { kind: "cloud" }, local },
        new ServerKeys({}),
      );
      const send = (route: string, body?: unknown, extra = {}) =>
        fetch(`${app.base}${route}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            cookie: app.cookie,
            "Content-Type": "application/json",
            ...extra,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-local-"));
      folders.push(folder);
      const file = path.join(folder, "long.mp4");
      execFileSync("ffmpeg", [
        ...["-hide_banner", "-v", "error", "-y", "-f", "lavfi"],
        ...["-i", "testsrc=size=160x90:rate=24:duration=21", "-c:v"],
        ...["libx264", "-pix_fmt", "yuv420p", file],
      ]);
      const uploaded = await fetch(`${app.base}/api/uploads?filename=l.mp4`, {
        method: "POST",
        headers: { cookie: app.cookie, "Content-Type": "video/mp4" },
        body: new Uint8Array(await readFile(file)),
      });
      const { source } = await uploaded.json();
      await send("/api/settings/run-location", { location: "local" });
      const body = {
        ...input,
        generator: "upscale",
        model: "seedvr2-upscale",
        sourceId: source.id,
      };
      const planned = await send("/api/upscale-parts", body);
      expect(planned.status).toBe(201);
      const { set } = await planned.json();
      expect(set.parts).toHaveLength(2);
      expect(set.estimateUsd).toBe(0);
      expect(fake.prompts).toHaveLength(0);
      const confirmed = await send(
        `/api/upscale-parts/${set.id}/confirm`,
        {},
        { "Quote-Id": set.quoteId },
      );
      expect(confirmed.status).toBe(202);
      expect(fake.prompts).toHaveLength(2);
      await send(
        `/api/upscale-parts/${set.id}/confirm`,
        {},
        { "Quote-Id": set.quoteId },
      );
      expect(fake.prompts).toHaveLength(2);
      expect(cloudRuns).toBe(0);
    },
    60_000,
  );

  it.skipIf(!hasFfmpeg)(
    "takes a longer part length on a local GPU, and 19 s parts on Comfy Cloud",
    async () => {
      fake = await fakeComfy({ nodes: nodesFor(seedvr2Workflow.graph) });
      const cloud: WorkflowClient = {
        run: async () => "https://cloud.comfy.org/api/v2/jobs/cloud-1",
        poll: async () => ({ id: "cloud-1", status: "Generating" }),
        download: async () => new Response(),
      };
      const local = new LocalComfyWorkflows({ url: fake.url });
      const app = await setup(
        undefined,
        new WorkflowDestinations(cloud, local),
        { destination: { kind: "cloud" }, local },
        new ServerKeys({}),
      );
      const send = (route: string, body?: unknown, extra = {}) =>
        fetch(`${app.base}${route}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            cookie: app.cookie,
            "Content-Type": "application/json",
            ...extra,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-local-"));
      folders.push(folder);
      const file = path.join(folder, "mix.mp4");
      execFileSync("ffmpeg", [
        ...["-hide_banner", "-v", "error", "-y", "-f", "lavfi"],
        ...["-i", "testsrc=size=160x90:rate=24:duration=23.125", "-c:v"],
        ...["libx264", "-pix_fmt", "yuv420p", file],
      ]);
      const uploaded = await fetch(`${app.base}/api/uploads?filename=m.mp4`, {
        method: "POST",
        headers: { cookie: app.cookie, "Content-Type": "video/mp4" },
        body: new Uint8Array(await readFile(file)),
      });
      const { source } = await uploaded.json();
      const body = {
        ...input,
        generator: "upscale",
        model: "seedvr2-upscale",
        sourceId: source.id,
      };
      // Comfy Cloud: 19 s parts, and no other length.
      const comfy = { "x-byo-key": "comfyui-test-key-0099" };
      const cloudPlan = await send("/api/upscale-parts", body, comfy);
      expect(cloudPlan.status).toBe(201);
      const cloudSet = (await cloudPlan.json()).set;
      expect(
        cloudSet.plan.parts.map((p: { frames: number }) => p.frames),
      ).toEqual([456, 99]);
      const refused = await send(
        "/api/upscale-parts",
        { ...body, partSeconds: 60 },
        comfy,
      );
      expect((await refused.json()).code).toBe("part_length_fixed");
      // A local GPU: 60 s parts make the 23.125 s clip one part, free.
      await send("/api/settings/run-location", { location: "local" });
      const planned = await send("/api/upscale-parts", {
        ...body,
        partSeconds: 60,
      });
      expect(planned.status).toBe(201);
      const { set } = await planned.json();
      expect(set.partSeconds).toBe(60);
      expect(set.plan.parts.map((p: { frames: number }) => p.frames)).toEqual([
        555,
      ]);
      expect(set.estimateUsd).toBe(0);
      await send(
        `/api/upscale-parts/${set.id}/confirm`,
        {},
        { "Quote-Id": set.quoteId },
      );
      expect(fake.prompts).toHaveLength(1);
      // A single local SeedVR2 run takes the whole clip too.
      const single = await send("/api/quotes", body);
      expect(single.status).toBe(201);
    },
    60_000,
  );
});
