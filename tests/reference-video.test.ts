import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createApp } from "../server/app";
import { validateInput } from "../server/validation";
import { publicJob } from "../server/store";
import { ComfySdkWorkflows, type SdkClient } from "../server/comfy-sdk";
import { h3Workflow } from "../shared/comfy/h3";
import { workflowAssetGraph } from "../server/comfy-assets";
import {
  composerInput,
  composerReducer,
  initialComposer,
  composerBlocked,
} from "../src/useComposer";
import { estimateRunUsd } from "../shared/quote";
import { requireRoute } from "../shared/provider";
import { BflClient } from "../server/bfl";
import { providerBody, hashReferences } from "../server/job-request";

const ref = `data:image/png;base64,${readFileSync(new URL("./fixtures/reference.png", import.meta.url)).toString("base64")}`;
const raw = {
  generator: "video",
  model: "minimax-h3",
  description:
    "Use <Picture 1> for identity, <Picture 2> for look and <Video 1> for motion.",
  cameraEnabled: false,
  draft: false,
  duration: 5,
  resolution: "hd",
  upscaleFactor: 2,
  sourceId: "guide",
  imageReferences: [ref, ref],
};
const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true });
});

describe("reference video contract", () => {
  it("requires valid references and a guide, and carries them out of the composer", () => {
    const input = validateInput(raw);
    expect(input).toMatchObject({
      sourceId: "guide",
      imageReferences: [ref, ref],
      cameraEnabled: false,
    });
    for (const patch of [
      { imageReferences: [] },
      { imageReferences: [ref] },
      { sourceId: "" },
      { imageReferences: [ref, "https://example.com/private"] },
    ])
      expect(() => validateInput({ ...raw, ...patch })).toThrow();
    const state = composerReducer(initialComposer, {
      type: "update",
      patch: { ...input, model: "minimax-h3", sourceId: "guide" },
    });
    expect(composerInput(state)).toMatchObject({
      imageReferences: [ref, ref],
      sourceId: "guide",
    });
    expect(composerBlocked(state, "guide", input.description)).toBe(false);
    expect(
      composerBlocked(
        { ...state, imageReferences: [] },
        "guide",
        input.description,
      ),
    ).toBe(true);
    expect(
      estimateRunUsd(input, { width: 256, height: 256, duration: 2 }),
    ).toBe(estimateRunUsd(input));
    expect(() => requireRoute("video", "minimax-h3", "bfl-key")).toThrow(
      /Comfy/,
    );
  });

  it("uses the tested guide preprocessors without changing reference roles", () => {
    for (const [guide, node] of [
      ["rgb", "202"],
      ["canny", "203"],
      ["depth", "206"],
    ] as const) {
      const graph = h3Workflow(guide).graph;
      expect(graph["136"].inputs).toMatchObject({
        "ref_images.ref_image_0": ["137", 0],
        "ref_images.ref_image_1": ["139", 0],
        "ref_videos.ref_video_0": [node, 0],
      });
      expect(graph["124"].inputs.steps).toBe(8);
      expect(graph["143"].inputs["selection.keep_percent"]).toBe(10);
    }
  });

  it("combines three guide branches behind one checkpoint and one uploaded video", () => {
    const graph = h3Workflow("combined").graph;
    expect(graph["136"].inputs).toMatchObject({
      "ref_videos.ref_video_0": ["202", 0],
      "ref_videos.ref_video_1": ["203", 0],
      "ref_videos.ref_video_2": ["206", 0],
    });
    expect(
      Object.values(graph).filter((n) => n.class_type === "UNETLoader"),
    ).toHaveLength(1);
    expect(
      Object.values(graph).filter((n) => n.class_type === "LoadVideo"),
    ).toHaveLength(1);
  });

  it("reserves before uploading, binds the quote to content, and never resubmits a replay", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "genobi-reference-video-"),
    );
    directories.push(directory);
    const uploaded: string[] = [];
    let posted: unknown;
    const sdk: SdkClient = {
      assets: {
        fromBytes: (_bytes, options) => ({
          asReference: async () => {
            const disk = JSON.parse(
              await readFile(path.join(directory, "jobs.json"), "utf8"),
            );
            expect(disk.jobs[0].status).toBe("submitting");
            expect(disk.quotes[0].jobId).toBe(disk.jobs[0].id);
            uploaded.push(options.filename);
            return { type: "core/ASSET", id: options.filename };
          },
        }),
      },
      workflows: { fromJson: (graph) => graph },
      submit: vi.fn(async (graph) => {
        posted = graph;
        return { id: "h3-test" };
      }),
      jobs: {
        get: async () => {
          throw new Error("not polled");
        },
      },
    };
    const { service, store } = await createApp({
      directory,
      publicDirectory: directory,
      workflows: new ComfySdkWorkflows({ connect: () => sdk, env: {} }),
      serverKey: "test-server-key",
    });
    store.data.sources.push({
      id: "guide",
      label: "Guide",
      url: "/api/clips/guide",
      origin: "upload",
      width: 256,
      height: 144,
      duration: 1,
      filePath: path.resolve("tests/fixtures/metadata.mp4"),
      sessionId: "owner",
      sha256: "guide-hash",
    });
    const input = validateInput(raw),
      key = "comfyui-test";
    await expect(service.quote(input, "other", key)).rejects.toThrow();
    const quote = await service.quote(input, "owner", key);
    await expect(
      service.submit(
        { ...input, description: "Changed" },
        "owner",
        "changed-quote",
        key,
        quote.id,
      ),
    ).rejects.toThrow();
    const job = await service.submit(input, "owner", "h3-once", key, quote.id);
    expect(job.status).toBe("Pending");
    expect(uploaded).toEqual(["identity.png", "look.png", "guide.mp4"]);
    expect(posted).toMatchObject({
      "137": { inputs: { image: { id: "identity.png" } } },
      "200": { inputs: { file: { id: "guide.mp4" } } },
    });
    expect(publicJob(job)).toMatchObject({ imageReferenceCount: 2 });
    expect(publicJob(job).imageReferences).toBeUndefined();
    expect(
      await readFile(path.join(directory, "jobs.json"), "utf8"),
    ).not.toContain(ref);
    expect(job.take?.inputs).toContainEqual({
      role: "source",
      assetId: "guide",
      sha256: "guide-hash",
    });
    expect(
      (await service.submit(input, "owner", "h3-once", key, quote.id)).id,
    ).toBe(job.id);
    expect(sdk.submit).toHaveBeenCalledOnce();
    await expect(
      service.submit(
        { ...input, imageReferences: [ref, `${ref}changed`] },
        "owner",
        "h3-once",
        key,
      ),
    ).rejects.toThrow(/different settings/);
  });

  it("fails before submission if a file slot is wrong or an upload fails", async () => {
    const assets = {
      fromBytes: vi.fn(() => ({
        asReference: async () => {
          throw new Error("private provider text");
        },
      })),
    };
    await expect(
      workflowAssetGraph(
        h3Workflow("rgb"),
        { prompt: "Scene" },
        { prompt: { bytes: new Uint8Array([1]), contentType: "image/png" } },
        assets,
      ),
    ).rejects.toMatchObject({ code: "workflow_unsent" });
    expect(assets.fromBytes).not.toHaveBeenCalled();
    await expect(
      workflowAssetGraph(
        h3Workflow("rgb"),
        { prompt: "Scene" },
        { identity: { bytes: new Uint8Array([1]), contentType: "image/png" } },
        assets,
      ),
    ).rejects.toThrow(/No generation was submitted/);
  });

  it("sends FLUX keyframes as ordered base64 with the documented i2v mode", async () => {
    const input = validateInput({
      ...raw,
      model: "flux-3-i2v",
      presetId: "orbit_l",
      imageReferences: [ref],
    });
    expect(input.sourceId).toBeUndefined();
    const body = await providerBody(
      input,
      hashReferences(input),
      "Scene",
      undefined,
      "flux-3-i2v",
      "bfl-key",
      "owner",
    );
    expect(body).toMatchObject({
      mode: "i2v",
      keyframes: [ref.split(",")[1]],
      duration: 5,
    });
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        id: "bfl-test",
        polling_url: "https://api.bfl.ai/v1/get_result?id=bfl-test",
      }),
    );
    await new BflClient(fetcher).submit("video", body, "bfl-key", {
      model: "flux-3-i2v",
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api.bfl.ai/v1/flux-3-video",
    );
    expect(() => requireRoute("video", "flux-3-i2v", "comfyui-test")).toThrow(
      /BFL/,
    );
  });
});
