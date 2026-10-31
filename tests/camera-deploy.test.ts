import { wav } from "./audio-fixtures";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowDestinations } from "../server/workflow-destinations";
import { ComfySdkWorkflows } from "../server/comfy-sdk";
import { Store, publicJob } from "../server/store";
import { WorkflowSettings } from "../server/workflow-settings";
import { ServerKeys } from "../server/keys";
import { JobService } from "../server/jobs";
import { DeploymentAssets } from "../server/deployment-assets";
import { validateInput } from "../server/validation";

const endpoint = "https://genobi.run.comfy.app";
const key = "comfyui-private-fixture-key";
const session = "11111111-1111-4111-8111-111111111111";
const requestInput = {
  generator: "video",
  presetId: "orbit_l",
  description: "A ceramic vessel.",
  cameraEnabled: true,
  resolution: "hd",
  draft: false,
  upscaleFactor: 2,
  model: "ltx-deploy-akuspace",
  duration: 8,
  aspectRatio: "16:9",
  deploy: { seed: 123, negativePrompt: "No cuts.", assets: {} },
};
const signed = "https://storage.googleapis.com/fixture/deploy.mp4?sig=fixture";
const v2Job = (status: string, error: object | null = null) => ({
  id: "fixture-job",
  status,
  created_at: "2026-10-30T00:00:00Z",
  started_at: null,
  completed_at: null,
  expires_at: "2026-10-31T00:00:00Z",
  queue_position: null,
  progress: null,
  outputs:
    status === "succeeded"
      ? [
          {
            id: "output",
            node_id: "75",
            name: "clip.mp4",
            type: "video",
            content_type: "video/mp4",
            size_bytes: 1024,
          },
        ]
      : [],
  error,
  urls: { self: "/api/v2/jobs/fixture-job", events: "", cancel: "" },
});
const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true });
});

/** Exercise the same settings/quote/job services as Express, without a listening socket. */
async function studio() {
  let state = "queued";
  let error: object | null = null;
  let uncertain = false;
  let reserved: (() => Promise<void>) | undefined;
  const calls: { url: string; init?: RequestInit }[] = [];
  const media = await readFile("tests/fixtures/metadata.mp4");
  let outputNode = "75";
  let audioNodes: string[] = [];
  const fetcher = vi.fn<typeof fetch>(async (target, init) => {
    const url = String(target);
    calls.push({ url, init });
    if (url === `${endpoint}/api/v2/jobs`) {
      const workflow = JSON.parse(String(init?.body)).workflow as Record<
        string,
        { class_type: string }
      >;
      outputNode = Object.entries(workflow).find(
        ([, n]) => n.class_type === "SaveVideo",
      )![0];
      audioNodes = Object.entries(workflow)
        .filter(([, n]) => n.class_type.startsWith("SaveAudio"))
        .map(([id]) => id);
      await reserved?.();
      if (uncertain) throw new TypeError("lost response");
      return Response.json(v2Job("queued"), { status: 201 });
    }
    if (url === `${endpoint}/api/v2/jobs/fixture-job`) {
      const job = v2Job(state, error);
      if (state === "succeeded") {
        job.outputs[0].node_id = outputNode;
        job.outputs.push(
          ...audioNodes.map((id) => ({
            id: `audio-${id}`,
            node_id: id,
            name: "audio.wav",
            type: "audio",
            content_type: "audio/wav",
            size_bytes: 2048,
          })),
        );
      }
      return Response.json(job);
    }
    if (url === `${endpoint}/api/v2/assets/output/content`)
      return new Response(null, { status: 302, headers: { Location: signed } });
    if (/\/api\/v2\/assets\/audio-[0-9]+\/content$/.test(url))
      return new Response(null, {
        status: 302,
        headers: {
          Location: "https://storage.googleapis.com/fixture/audio.wav",
        },
      });
    if (url === "https://storage.googleapis.com/fixture/audio.wav")
      return new Response(wav(1));
    if (url === signed) return new Response(media);
    if (url.includes("/api/v2/assets/by-hash/") && init?.method === "HEAD")
      return new Response(null, { status: 404 });
    if (url === `${endpoint}/api/v2/assets`)
      return Response.json(
        { id: "asset-upload", created_new: true },
        { status: 201 },
      );
    throw new Error(`Unexpected mocked route: ${new URL(url).pathname}`);
  });
  const dir = await mkdtemp(path.join(os.tmpdir(), "camera-deploy-"));
  directories.push(dir);
  const store = new Store(dir);
  await store.load();
  const settings = new WorkflowSettings(store);
  const keys = new ServerKeys();
  const assets = new DeploymentAssets(settings, keys, fetcher);
  const workflows = new WorkflowDestinations(
    new ComfySdkWorkflows({ fetcher, env: {} }),
    { fetcher },
  );
  const service = new JobService(
    store,
    dir,
    keys,
    undefined,
    workflows,
    settings,
    assets,
  );
  let prepared = requestInput;
  const prepare = async () => {
    const audio = await assets.stage(
      session,
      "TRACK_AUDIO",
      wav(8),
      "audio/wav",
      key,
    );
    const image = await assets.stage(
      session,
      "REFERENCE_PNG",
      await readFile("tests/fixtures/reference.png"),
      "image/png",
      key,
    );
    prepared = {
      ...requestInput,
      deploy: {
        ...requestInput.deploy,
        assets: { REFERENCE_PNG: image, TRACK_AUDIO: audio },
      },
    };
  };
  const register = (url = endpoint) =>
    settings.setLocation(session, "deployment", url);
  const quote = (body = prepared, owner = session) =>
    service.quote(validateInput(body), owner, key);
  const submit = (id: string, quoteId?: string, body = prepared) =>
    service.submit(validateInput(body), session, id, key, quoteId);
  const poll = async (id: string) => (await service.poll(id, session, key)).job;
  return {
    prepare,
    store,
    settings,
    service,
    assets,
    calls,
    register,
    quote,
    submit,
    poll,
    state: (next: string, failure?: object) => {
      state = next;
      error = failure ?? null;
    },
    uncertain: () => {
      uncertain = true;
    },
    onSubmit: (check: () => Promise<void>) => {
      reserved = check;
    },
  };
}

describe(
  "Camera → Comfy Deploy (real SDK, mocked fetch only)",
  { timeout: 15_000 },
  () => {
    it("persists registration without keys and quotes/confirms/reserves exactly once before submission", async () => {
      const s = await studio();
      expect((await s.register()).deployment).toEqual({
        url: endpoint,
        name: "genobi",
      });
      const disk = () => readFile(`${s.store.directory}/jobs.json`, "utf8");
      expect(await disk()).not.toContain(key);
      expect(s.calls).toHaveLength(0);
      await s.prepare();
      const quote = await s.quote();
      expect(quote.billing).toMatch(/GPU time/);
      expect(quote.recipe.deployment!.url).toBe(endpoint);
      expect(s.calls.filter((c) => c.url.endsWith("/jobs"))).toHaveLength(0);
      await expect(s.submit("missing-confirm")).rejects.toMatchObject({
        code: "quote_missing",
      });
      s.onSubmit(async () => {
        const saved = JSON.parse(await disk());
        expect(saved.jobs).toHaveLength(1);
        expect(saved.jobs[0].status).toBe("submitting");
        expect(saved.quotes[0].jobId).toBe(saved.jobs[0].id);
      });
      const submit = () => s.submit("one-deploy-run", quote.id);
      const [a, b] = await Promise.all([submit(), submit()]);
      expect(b.id).toBe(a.id);
      const posts = s.calls.filter(
        (c) => c.url.endsWith("/jobs") && c.init?.method === "POST",
      );
      expect(posts).toHaveLength(1);
      expect(new Headers(posts[0].init?.headers).get("Idempotency-Key")).toBe(
        a.id,
      );
      const graph = JSON.parse(String(posts[0].init?.body)).workflow;
      expect(graph["12"].inputs.text).toBe(a.prompt);
      expect(graph["50"].inputs.noise_seed).toBe(123);
      expect(a.deployment).toEqual({ url: endpoint, name: "genobi" });
      expect(publicJob(a).deploy).toBeUndefined();
      await expect(
        s.submit("different-deploy-run", quote.id),
      ).rejects.toMatchObject({ code: "quote_used" });
      expect(await disk()).not.toContain(key);
    });

    it("rejects endpoint changes after quote and polls the recorded endpoint after settings change and restart", async () => {
      const s = await studio();
      await s.register();
      await s.prepare();
      const quote = await s.quote();
      await s.register("https://other.run.comfy.app");
      await expect(
        s.submit("changed-endpoint", quote.id),
      ).rejects.toMatchObject({
        code: "invalid_deployment_input",
      });
      await s.register();
      const job = await s.submit("recorded-endpoint", quote.id);
      await s.register("https://other.run.comfy.app");
      await s.store.load();
      s.state("running");
      expect((await s.poll(job.id)).status).toBe("Generating");
      s.store.data.jobs[0].lastPolledAt = 0;
      s.state("succeeded");
      const ready = await s.poll(job.id);
      expect(ready.status).toBe("Ready");
      expect(
        await readFile(`${s.store.directory}/media/${job.id}.mp4`),
      ).toEqual(await readFile("tests/fixtures/metadata.mp4"));
      expect(s.store.data.sources.some((source) => source.id === job.id)).toBe(
        true,
      );
      for (const call of s.calls) {
        expect(new URL(call.url).origin).toBe(
          call.url.startsWith("https://storage.googleapis.com/")
            ? new URL(signed).origin
            : endpoint,
        );
        expect(new Headers(call.init?.headers).get("Authorization")).toBe(
          call.url.startsWith("https://storage.googleapis.com/")
            ? null
            : `Bearer ${key}`,
        );
      }
    });

    it("never resubmits a lost response, including after restart; failures show a sanitized cause", async () => {
      const s = await studio();
      await s.register();
      await s.prepare();
      const quote = await s.quote();
      s.uncertain();
      const first = await s.submit("uncertain-deploy", quote.id);
      expect(first.status).toBe("Error");
      expect(first.error).toMatch(/could not be confirmed/);
      expect((await s.submit("uncertain-deploy", quote.id)).id).toBe(first.id);
      await s.poll(first.id);
      await s.store.load();
      expect((await s.submit("uncertain-deploy", quote.id)).id).toBe(first.id);
      expect(
        s.calls.filter(
          (c) => c.url.endsWith("/jobs") && c.init?.method === "POST",
        ),
      ).toHaveLength(1);
      const f = await studio();
      await f.register();
      await f.prepare();
      const offer = await f.quote();
      const job = await f.submit("failed-deploy", offer.id);
      f.state("failed", {
        code: "execution_error",
        message: `missing /secret/file ${key}`,
        class_type: "UNETLoader",
        traceback: "/private/trace",
      });
      const failed = await f.poll(job.id);
      expect(failed.status).toBe("Error");
      expect(failed.error).toMatch(
        /Comfy deployment could not find.*UNETLoader/,
      );
      expect(failed.error).not.toMatch(/private|secret|comfyui-/);
    });

    it("stages files without submitting and enforces session, token and endpoint ownership", async () => {
      const s = await studio();
      await s.register();
      const png = await readFile("tests/fixtures/reference.png");
      const image = await s.assets.stage(
        session,
        "REFERENCE_PNG",
        png,
        "image/png",
        key,
      );
      const audio = await s.assets.stage(
        session,
        "TRACK_AUDIO",
        Buffer.from("RIFFxxxxWAVEfixture"),
        "audio/wav",
        key,
      );
      const body = {
        ...requestInput,
        model: "ltx-deploy-akuspace",
        duration: 8,
        deploy: {
          seed: 0,
          negativePrompt: "",
          assets: { REFERENCE_PNG: image, TRACK_AUDIO: audio },
        },
      };
      expect((await s.quote(body)).recipe.id).toBe("ltx-deploy-akuspace");
      await s.settings.setLocation("stranger", "deployment", endpoint);
      await expect(s.quote(body, "stranger")).rejects.toMatchObject({
        code: "invalid_deployment_input",
      });
      await expect(
        s.quote({
          ...body,
          deploy: {
            ...body.deploy,
            assets: { REFERENCE_PNG: image, TRACK_AUDIO: image },
          },
        }),
      ).rejects.toMatchObject({ code: "invalid_deployment_input" });
      await expect(
        s.assets.stage(
          session,
          "REFERENCE_PNG",
          Buffer.from("bad"),
          "image/png",
          key,
        ),
      ).rejects.toThrow(/Choose/);
      await s.register("https://other.run.comfy.app");
      await expect(s.quote(body)).rejects.toMatchObject({
        code: "invalid_deployment_input",
      });
      expect(s.calls.some((c) => c.url.endsWith("/jobs"))).toBe(false);
    });
    it("downloads the L2R room IR and wet mix alongside video with session ownership", async () => {
      const s = await studio();
      await s.register();
      const image = await s.assets.stage(
        session,
        "REFERENCE_PNG",
        await readFile("tests/fixtures/reference.png"),
        "image/png",
        key,
      );
      const audio = await s.assets.stage(
        session,
        "TRACK_AUDIO",
        wav(8),
        "audio/wav",
        key,
      );
      const take = await s.assets.stage(
        session,
        "TAKE_WEBM",
        new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0]),
        "video/webm",
        key,
      );
      const recipe = JSON.stringify({
        version: 1,
        fps: 24,
        width: 1024,
        height: 576,
        frames: 193,
      });
      const body = {
        ...requestInput,
        model: "ltx-deploy-layout-to-video",
        duration: 8,
        deploy: {
          seed: 0,
          negativePrompt: "",
          recipe,
          assets: { REFERENCE_PNG: image, TRACK_AUDIO: audio, TAKE_WEBM: take },
        },
      };
      const quote = await s.quote(body);
      await s.settings.select(
        session,
        "ltx-deploy-layout-to-video",
        "world-builder-l2r-a2v-studio",
      );
      await expect(
        s.submit("room-with-audio", quote.id, body),
      ).rejects.toMatchObject({ code: "quote_mismatch" });
      expect(s.calls.some((c) => c.url.endsWith("/jobs"))).toBe(false);
      await s.settings.select(
        session,
        "ltx-deploy-layout-to-video",
        "world-builder-l2r-a2v",
      );
      const job = await s.submit("room-with-audio", quote.id, body);
      s.state("succeeded");
      const ready = await s.poll(job.id);
      expect(ready.status).toBe("Ready");
      expect(ready.companions?.map((f) => f.label)).toEqual([
        "Room impulse response",
        "Room wet mix",
      ]);
      const sources = s.store.data.sources.filter(
        (source) => source.mediaType === "audio",
      );
      expect(sources).toHaveLength(2);
      for (const source of sources) {
        expect(source.sessionId).toBe(session);
        expect(source.contentType).toBe("audio/wav");
        expect(await readFile(source.filePath)).toEqual(Buffer.from(wav(1)));
        expect(ready.companions).toContainEqual({
          assetId: source.id,
          label: source.label,
          url: source.url,
          mediaType: "audio",
          contentType: "audio/wav",
        });
      }
      expect(publicJob(ready)).not.toHaveProperty("companionDownloads");
      expect(s.calls.filter((c) => c.url.endsWith("/jobs"))).toHaveLength(1);
    });
  },
);
