import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  KLEIN_UNET,
  kleinSize,
  kleinValues,
  kleinWorkflow,
} from "../shared/comfy/klein";
import { workflowOutput, workflowRun, workflows } from "../shared/comfy/runs";
import { danglingLinks, fillSlots, isLink } from "../shared/comfy/slots";
import { isUnsent } from "../shared/comfy/workflow";
import { parseLocalModels } from "../shared/comfy/local-models";
import { parseModelFile } from "../shared/comfy/destination";
import { ComfySdkWorkflows, type Connect } from "../server/comfy-sdk";
import { BflClient } from "../server/bfl";
import { validateInput } from "../server/validation";
import {
  IMAGE_ASPECT_RATIOS,
  imageBody,
  KLEIN_RESOLUTIONS,
  MAX_IMAGE_PIXELS,
} from "../shared/image";
import { requireRoute } from "../shared/provider";
import { startTake } from "../shared/take";
import { imagePrompt } from "../src/image-regions";
import { setup } from "./server-harness";
import { kleinBaseWorkflow } from "../shared/comfy/klein-base";
import { infoFor } from "./comfy-readiness-fixture";

const graph = kleinWorkflow.graph;
const layout = imagePrompt(
  "A kite festival.",
  [
    {
      id: "kite_1",
      box: [100, 100, 400, 500],
      action: "change",
      description: "a red kite",
    },
  ],
  false,
);

describe("the open Klein graph", () => {
  it("holds Comfy's Klein text-to-image nodes, linked only to nodes it has", () => {
    expect(danglingLinks(graph)).toEqual([]);
    // The node classes the README checks against the Cloud inventory.
    expect(
      [...new Set(Object.values(graph).map((n) => n.class_type))].sort(),
    ).toEqual([
      "CLIPLoader",
      "CLIPTextEncode",
      "ComfySwitchNode",
      "EmptyFlux2LatentImage",
      "KSampler",
      "PrimitiveStringMultiline",
      "SaveImage",
      "StringConcatenate",
      "TextGenerate",
      "UNETLoader",
      "VAEDecode",
      "VAELoader",
    ]);
    for (const node of kleinWorkflow.requiredNodes)
      expect(Object.values(graph).map((n) => n.class_type)).toContain(node);
    for (const model of kleinWorkflow.requiredModels)
      expect(JSON.stringify(graph)).toContain(model);
    // The official template's sampler: 16 steps, CFG 1, euler / simple.
    expect(graph["18:7"].inputs).toMatchObject({
      steps: 16,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "simple",
      denoise: 1,
    });
    // Dynamic-combo inputs are dotted, as the API format writes them.
    expect(graph["18:11"].inputs).toMatchObject({
      sampling_mode: "on",
      "sampling_mode.top_p": 0.95,
      max_length: 3584,
      system_prompt: ["18:14", 0],
    });
    expect(graph["9"]).toMatchObject({
      class_type: "SaveImage",
      inputs: { images: ["18:8", 0] },
    });
    expect(kleinWorkflow.output).toEqual({ nodeId: "9", media: "image" });
    // The pinned graph carries the official Comfy template filename; Cloud
    // preflight resolves the older account alias if that is what is listed.
    expect(KLEIN_UNET).toBe("flux3-image-klein-int8-convrot.safetensors");
  });

  it("puts a literal at every slot, and the upsampler on by default", () => {
    for (const { path: slot } of Object.values(kleinWorkflow.slots)) {
      const dot = slot.indexOf(".");
      const value = graph[slot.slice(0, dot)]?.inputs[slot.slice(dot + 1)];
      expect(value, slot).toBeDefined();
      expect(isLink(value), slot).toBe(false);
    }
    expect(graph["18:16"].inputs.switch).toBe(true);
    // The rows join after the switch, so the upsampler never sees them.
    expect(graph["18:20"].inputs.string_a).toEqual(["18:16", 0]);
    expect(graph["18:4"].inputs.text).toEqual(["18:20", 0]);
  });
});

describe("filling the open Klein graph", () => {
  it("upsamples a plain prompt for its canvas", () => {
    const values = kleinValues(
      { imageAspectRatio: "16:9", imageResolution: "1k" },
      "A kite festival.",
      () => 0.5,
    );
    expect(values).toEqual({
      prompt: "TARGET CANVAS: 16:9\nA kite festival.",
      layout: "",
      upsample: true,
      width: 1360,
      height: 768,
      seed: 2 ** 47,
    });
  });

  it("sends a layout past the upsampler, in BFL's caption-then-rows form", () => {
    const values = kleinValues({ imageResolution: "2k" }, layout, () => 0);
    expect(values.upsample).toBe(false);
    expect(values.prompt).toBe(
      "A kite festival.\n\nplace <kite_1> at the top left.",
    );
    expect(JSON.parse(values.layout)).toEqual([
      { id: "kite_1", bbox: [100, 100, 400, 500], desc: "a red kite" },
    ]);
    // No named ratio: square, as the composer sends boxes.
    expect([values.width, values.height]).toEqual([2048, 2048]);
    const filled = fillSlots(graph, kleinWorkflow.slots, values);
    expect(filled["18:17"].inputs.value).toBe(values.prompt);
    expect(filled["18:20"].inputs.string_b).toBe(values.layout);
    expect(filled["18:16"].inputs.switch).toBe(false);
    expect(filled["18:6"].inputs).toMatchObject({ width: 2048, height: 2048 });
    expect(filled["18:7"].inputs.seed).toBe(0);
    expect(graph["18:17"].inputs.value).not.toBe(values.prompt);
  });

  it("sizes every offered ratio and tier on the 16-pixel step, within the reader's ceiling", () => {
    for (const tier of KLEIN_RESOLUTIONS)
      for (const ratio of IMAGE_ASPECT_RATIOS) {
        if (ratio === "auto") continue;
        const { width, height } = kleinSize(ratio, tier);
        const where = `${ratio} at ${tier}: ${width} × ${height}`;
        expect(width % 16, where).toBe(0);
        expect(height % 16, where).toBe(0);
        // inspectImage refuses more; a paid result must always be readable.
        expect(width * height, where).toBeLessThanOrEqual(MAX_IMAGE_PIXELS);
        const [w, h] = ratio.split(":").map(Number);
        expect(Math.abs(width / height - w / h), where).toBeLessThan(0.05);
      }
    expect(kleinSize("1:1", "768sq")).toEqual({ width: 768, height: 768 });
    expect(kleinSize("1:1", "4k")).toEqual({ width: 4096, height: 4096 });
    // Rounding up gave 4736 × 3552, past the ceiling.
    expect(kleinSize("4:3", "4k")).toEqual({ width: 4720, height: 3536 });
  });

  it("is chosen by model id for both adapters, and refuses one it lacks", () => {
    expect(workflows["workflow/flux-3-klein-t2i"]).toBe(kleinWorkflow);
    expect(workflows["workflow/flux-3-klein-base-t2i"]).toBe(kleinBaseWorkflow);
    const run = workflowRun(
      "workflow/flux-3-klein-base-t2i",
      validateInput({
        generator: "image",
        model: "flux-3-klein",
        description: "A kite.",
        imageAspectRatio: "4:3",
      }),
      "A kite.",
    );
    expect(run.template).toBe(kleinBaseWorkflow);
    expect(run.values).toMatchObject({ upsample: true, width: 1168 });
    expect(workflowOutput("workflow/flux-3-klein-t2i").media).toBe("image");
    expect(workflowOutput("workflow/ltx-2-5-akuspace-t2v")).toEqual({
      nodeId: "75",
      media: "video",
    });
    let error: unknown;
    try {
      workflowRun("workflow/nope", {} as never, "");
    } catch (caught) {
      error = caught;
    }
    expect(isUnsent(error)).toBe(true);
  });
});

describe("the Klein model file for a local ComfyUI", () => {
  it("accepts a name inside ComfyUI's model folders and nothing else", () => {
    expect(parseModelFile(undefined)).toBeUndefined();
    expect(parseModelFile("")).toBeUndefined();
    for (const ok of [
      "flux3-image-klein-int8-convrot.safetensors",
      "flux3/klein bf16.safetensors",
      "a/b/c/d/klein.gguf",
    ])
      expect(parseModelFile(ok)).toBe(ok);
    for (const bad of [
      "/Users/someone/models/klein.safetensors",
      "../klein.safetensors",
      "flux3/../../klein.safetensors",
      "C:\\models\\klein.safetensors",
      "klein.ckpt",
      "klein.safetensors\n",
      "a/b/c/d/e/klein.safetensors",
      `${"a".repeat(600)}.safetensors`,
      7,
    ]) {
      let message = "";
      try {
        parseModelFile(bad);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, String(bad)).toMatch(/local model file/);
      // The refusal never repeats what was configured.
      if (typeof bad === "string" && bad.length > 4)
        expect(message).not.toContain(bad);
    }
  });

  it("reads the local model map, with GENOBI_KLEIN_MODEL kept as Klein's file", () => {
    expect(parseLocalModels(undefined, "flux3/klein.safetensors")).toEqual({
      [kleinWorkflow.id]: { unet_name: "flux3/klein.safetensors" },
    });
    expect(
      parseLocalModels(undefined, undefined, "flux3/base.safetensors"),
    ).toEqual({
      [kleinBaseWorkflow.id]: { unet_name: "flux3/base.safetensors" },
    });
    expect(
      parseLocalModels(
        JSON.stringify({
          [kleinWorkflow.id]: { vae: "flux2/vae.safetensors" },
          "ltx-2-5-akuspace-t2v": { lora_name: "loras/akuspace.safetensors" },
        }),
        "flux3/klein.safetensors",
      ),
    ).toEqual({
      [kleinWorkflow.id]: {
        vae: "flux2/vae.safetensors",
        unet_name: "flux3/klein.safetensors",
      },
      "ltx-2-5-akuspace-t2v": { lora_name: "loras/akuspace.safetensors" },
    });
    const secret = "/Users/someone/models/klein.safetensors";
    for (const [map, klein] of [
      ["{not json", undefined],
      ["[]", undefined],
      [JSON.stringify({ nope: { unet_name: "a.safetensors" } }), undefined],
      [
        JSON.stringify({ [kleinWorkflow.id]: { prompt: "a.safetensors" } }),
        undefined,
      ],
      [
        JSON.stringify({ [kleinWorkflow.id]: { unet_name: secret } }),
        undefined,
      ],
      [
        JSON.stringify({ [kleinWorkflow.id]: { unet_name: "a.safetensors" } }),
        "b.safetensors",
      ],
    ] as const) {
      let message = "";
      try {
        parseLocalModels(map, klein);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, map).toMatch(/GENOBI_(LOCAL|KLEIN)_MODEL/);
      expect(message).not.toContain(secret);
      expect(message).not.toContain("someone");
    }
  });
});

describe("Klein through the SDK", () => {
  it("submits the filled graph and reads the image output, not a video", async () => {
    const submitted: unknown[] = [];
    const image = {
      nodeId: "9",
      type: "image",
      getDownloadUrl: async () => ({
        url: "https://storage.googleapis.com/out/klein.png",
      }),
    };
    const video = {
      nodeId: "75",
      type: "video",
      getDownloadUrl: async () => ({
        url: "https://storage.googleapis.com/out/wrong.mp4",
      }),
    };
    const connect = vi.fn<Connect>(() => ({
      workflows: { fromJson: (g) => g },
      async submit(workflow) {
        submitted.push(workflow);
        return { id: "k-1" };
      },
      jobs: {
        get: async () => ({
          id: "k-1",
          status: "succeeded",
          progress: null,
          outputs: [video, image],
        }),
      },
    }));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(infoFor(kleinWorkflow.graph)));
    const client = new ComfySdkWorkflows({ connect, env: {}, fetcher });
    const values = kleinValues({ imageAspectRatio: "1:1" }, layout, () => 0);
    const handle = await client.run(kleinWorkflow, values, "comfyui-k", {
      idempotencyKey: "job-k",
    });
    const sent = submitted[0] as typeof graph;
    expect(sent["18:20"].inputs.string_b).toBe(values.layout);
    expect(sent["18:1"].inputs.unet_name).toBe(KLEIN_UNET);
    expect(
      await client.poll(handle, "comfyui-k", kleinWorkflow.output),
    ).toEqual({
      id: "k-1",
      status: "Ready",
      result: { sample: "https://storage.googleapis.com/out/klein.png" },
    });
  });
});

describe("Klein's API run on BFL direct", () => {
  it("posts to /v1/flux-3-image-klein with no grounding field", async () => {
    const input = validateInput({
      generator: "image",
      model: "flux-3-klein-api",
      description: "A kite.",
      imageResolution: "1.5k",
    });
    const body = imageBody(input);
    expect(body).not.toHaveProperty("grounding");
    expect(body).toEqual({
      prompt: "A kite.",
      aspect_ratio: "auto",
      resolution: "1.5k",
      safety_tolerance: 2,
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: "t",
        polling_url: "https://api.bfl.ai/v1/get_result?id=t",
      }),
    );
    await new BflClient(fetcher).submit("image", body, "bfl-key", {
      model: "flux-3-klein-api",
    });
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "https://api.bfl.ai/v1/flux-3-image-klein",
    );
    await expect(
      new BflClient(fetcher).submit("video", body, "bfl-key", {
        model: "flux-3-klein-api",
      }),
    ).rejects.toThrow("image endpoint only");
  });

  it("is route-checked against the key before a quote, and recorded as it ran", async () => {
    expect(() =>
      requireRoute("image", "flux-3-klein-api", "comfyui-key"),
    ).toThrow("BFL direct");
    expect(() => requireRoute("image", "flux-3-klein", "bfl-key")).toThrow(
      "Connect a Comfy key",
    );
    expect(() =>
      requireRoute("image", "flux-3-klein-api", "bfl-key"),
    ).not.toThrow();
    const recipe = async (
      model: "flux-3-klein" | "flux-3-klein-api",
      comfy: boolean,
    ) =>
      (
        await startTake(
          validateInput({
            generator: "image",
            model,
            description: "A kite.",
            imageAspectRatio: "1:1",
          }),
          comfy,
        )
      ).recipe;
    expect(await recipe("flux-3-klein", true)).toEqual({
      id: "flux-3-klein",
      version: 2,
      route: "workflow",
    });
    expect(await recipe("flux-3-klein-api", false)).toMatchObject({
      id: "flux-3-klein-api",
      route: "bfl",
    });
  });
});

describe("the local server runs open Klein end to end", () => {
  it("submits once, polls, and saves the PNG as an image take", async () => {
    const key = "comfyui-test-klein-0001";
    const png = await readFile(path.resolve("tests/fixtures/reference.png"));
    const signed = "https://storage.googleapis.com/comfy-out/klein.png?X-Sig=1";
    const job = (status: string, outputs: object[] = []) => ({
      id: "k-1",
      status,
      created_at: "2026-10-21T00:00:00Z",
      started_at: null,
      completed_at: null,
      expires_at: "2026-10-22T00:00:00Z",
      queue_position: null,
      progress: null,
      outputs,
      error: null,
      urls: { self: "/api/v2/jobs/k-1", events: "", cancel: "" },
    });
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher: typeof fetch = async (target, init) => {
      const url = String(target);
      calls.push({ url, init });
      if (url === "https://cloud.comfy.org/api/object_info")
        return Response.json(infoFor(kleinBaseWorkflow.graph));
      if (url === "https://cloud.comfy.org/api/v2/jobs")
        return Response.json(job("queued"), { status: 201 });
      if (url === "https://cloud.comfy.org/api/v2/jobs/k-1")
        return Response.json(
          job("succeeded", [
            {
              id: "asset-k",
              node_id: "9",
              name: "FLUX3-Klein_t2i_00001_.png",
              type: "image",
              content_type: "image/png",
              size_bytes: png.length,
            },
          ]),
        );
      if (url === "https://cloud.comfy.org/api/v2/assets/asset-k/content")
        return new Response(null, {
          status: 302,
          headers: { Location: signed },
        });
      if (url === signed) return new Response(png);
      return new Response("unexpected", { status: 500 });
    };
    const { post, base, cookie, bfl } = await setup(
      undefined,
      new ComfySdkWorkflows({ fetcher, env: {} }),
    );
    const request = {
      generator: "image",
      model: "flux-3-klein",
      description: layout,
      imageAspectRatio: "16:9",
      imageResolution: "1k",
    };
    const { job: accepted } = await (
      await post("klein-open-1", request, { "x-byo-key": key })
    ).json();
    expect(accepted).toMatchObject({
      status: "Pending",
      mediaType: "image",
      costEstimateUsd: 0.009,
    });
    const postCall = calls.find(
      (call) => call.url === "https://cloud.comfy.org/api/v2/jobs",
    );
    const { workflow } = JSON.parse(String(postCall?.init?.body));
    expect(workflow["18:16"].inputs.switch).toBe(false);
    expect(workflow["18:20"].inputs.string_b).toContain('"kite_1"');
    expect(workflow["18:6"].inputs).toMatchObject({ width: 1360, height: 768 });
    const { job: ready } = await (
      await fetch(`${base}/api/jobs/${accepted.id}`, {
        headers: { cookie, "x-byo-key": key },
      })
    ).json();
    expect(ready).toMatchObject({
      status: "Ready",
      resultContentType: "image/png",
    });
    const { take } = await (
      await fetch(`${base}/api/takes/${accepted.id}`, { headers: { cookie } })
    ).json();
    expect(take).toMatchObject({
      recipe: { id: "flux-3-klein", route: "workflow" },
      outputs: [{ mediaType: "image", contentType: "image/png" }],
    });
    for (const call of calls) expect(call.url).not.toContain(key);
    expect(bfl.submissions).toBe(0);
  });
});
