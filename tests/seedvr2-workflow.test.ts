import { describe, expect, it } from "vitest";
import {
  estimateSeedvr2Usd,
  requireSeedvr2Fit,
  seedvr2Files,
  seedvr2Values,
  seedvr2Workflow,
} from "../shared/comfy/seedvr2";
import { workflowOutput, workflowRun, workflows } from "../shared/comfy/runs";
import { danglingLinks, fillSlots } from "../shared/comfy/slots";
import { requireTemplateFor, templatesFor } from "../shared/comfy/workflows";
import { isUnsent } from "../shared/comfy/workflow";
import { estimateUpscaleUsd } from "../shared/presets";
import {
  entriesFor,
  entryFor,
  OPEN_UPSCALE_DEFAULT,
  readyEntry,
} from "../shared/registry";
import { estimateRunUsd } from "../shared/quote";
import { requiredKeyKind, requireRoute } from "../shared/provider";
import { validateInput } from "../server/validation";
import { input } from "./server-harness";

const graph = seedvr2Workflow.graph;
const upscale = {
  ...input,
  generator: "upscale",
  model: "seedvr2-upscale",
  sourceId: "clip",
};

describe("the SeedVR2 graph", () => {
  it("is Comfy's 3B int8 template on core nodes, linked only to nodes it has", () => {
    expect(danglingLinks(graph)).toEqual([]);
    expect(
      [...new Set(Object.values(graph).map((n) => n.class_type))].sort(),
    ).toEqual([
      "ComfySwitchNode",
      "CreateVideo",
      "GetVideoComponents",
      "KSampler",
      "LoadVideo",
      "PrimitiveBoolean",
      "ResizeImageMaskNode",
      "SaveVideo",
      "SeedVR2Conditioning",
      "SeedVR2PostProcessing",
      "SeedVR2Preprocess",
      "SeedVR2TemporalChunk",
      "SeedVR2TemporalMerge",
      "UNETLoader",
      "VAEDecodeTiled",
      "VAEEncodeTiled",
      "VAELoader",
      "Video Slice",
    ]);
    for (const node of seedvr2Workflow.requiredNodes)
      expect(Object.values(graph).map((n) => n.class_type)).toContain(node);
    expect(seedvr2Workflow.requiredModels).toEqual([
      "seedvr2_3b_int8_convrot.safetensors",
      "seedvr2_ema_vae_fp16.safetensors",
    ]);
    // The template's one-step sampler and its untouched defaults: no trim,
    // no latent split, no colour correction.
    expect(graph["66:54"].inputs).toMatchObject({
      steps: 1,
      cfg: 1,
      sampler_name: "euler",
      scheduler: "simple",
      denoise: 1,
    });
    expect(graph["66:81"].inputs.switch).toBe(false);
    expect(graph["66:105"].inputs.value).toBe(false);
    expect(graph["66:59"].inputs.color_correction_method).toBe("none");
    // The fps, audio and bit depth come from the source, never a constant.
    expect(graph["66:75"].inputs).toMatchObject({
      fps: ["66:74", 2],
      audio: ["66:74", 1],
      bit_depth: ["66:74", 3],
    });
    expect(workflowOutput("workflow/seedvr2-upscale")).toEqual({
      nodeId: "76",
      media: "video",
    });
  });

  it("writes the amount and a seed into their slots, and nothing else", () => {
    const values = seedvr2Values({ upscaleFactor: 2.5 }, () => 0.5);
    expect(values).toEqual({ scale: 2.5, seed: 2 ** 47 });
    const filled = fillSlots(graph, seedvr2Workflow.slots, {
      ...values,
      video: "genobi/clip.mp4",
    });
    expect(filled["66:57"].inputs["resize_type.multiplier"]).toBe(2.5);
    expect(filled["66:54"].inputs.seed).toBe(2 ** 47);
    expect(filled["73"].inputs.file).toBe("genobi/clip.mp4");
    // The source graph is untouched.
    expect(graph["66:57"].inputs["resize_type.multiplier"]).toBe(2);
    expect(() => seedvr2Values({ upscaleFactor: 4 })).toThrow(/1.5× and 3×/);
    expect(
      isUnsent(catchError(() => seedvr2Values({ upscaleFactor: 9 }))),
    ).toBe(true);
  });

  it("sends the source MP4 as its one file", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(seedvr2Files(bytes)).toEqual({
      video: { bytes, contentType: "video/mp4" },
    });
    expect(() => seedvr2Files(new Uint8Array())).toThrow(/MP4/);
  });
});

describe("the seedvr2-upscale entry", () => {
  it("is a ready, open upscale on the workflow route with the upscale controls", () => {
    expect(readyEntry("seedvr2-upscale")).toMatchObject({
      generator: "upscale",
      route: "workflow",
      model: "workflow/seedvr2-upscale",
      open: true,
      camera: null,
      videoModel: "seedvr2-upscale",
      controls: { kind: "upscale" },
    });
    expect(workflows["workflow/seedvr2-upscale"]).toBe(seedvr2Workflow);
    expect(requireTemplateFor("seedvr2-upscale").capability).toBe("upscale");
    expect(templatesFor("upscale").map((t) => t.id)).toEqual([
      "seedvr2-upscale",
    ]);
    expect(OPEN_UPSCALE_DEFAULT).toBe("seedvr2-upscale");
    // Its own Upscale family, first and beside FLUX Video Upscale; the only
    // upscaler Open only keeps. FLUX lists no upscaler any more.
    const upscalers = (openOnly: boolean) =>
      entriesFor("upscale", { openOnly }).map((e) => e.id);
    expect(upscalers(false)).toEqual(["seedvr2-upscale", "flux-video-upscale"]);
    expect(upscalers(true)).toEqual(["seedvr2-upscale"]);
    expect(
      entriesFor("flux").some(
        (e) => e.status === "ready" && e.generator === "upscale",
      ),
    ).toBe(false);
  });

  it("is held only when asked for; every other upscale stays FLUX's", () => {
    expect(entryFor("upscale", "seedvr2-upscale").id).toBe("seedvr2-upscale");
    expect(entryFor("upscale", "flux-3").id).toBe("flux-video-upscale");
    expect(entryFor("upscale", "ltx-2.5").id).toBe("flux-video-upscale");
    expect(entryFor("upscale").id).toBe("flux-video-upscale");
    // A video asked of the upscaler falls back to FLUX 3, never to SeedVR2.
    expect(entryFor("video", "seedvr2-upscale").id).toBe("flux-3-video");
  });

  it("validates as an upscale only, keeping no prompt or Creative mode", () => {
    const valid = validateInput({
      ...upscale,
      upscaleCreativity: 1,
      upscalePrompt: "sharper",
    });
    expect(valid).toMatchObject({
      model: "seedvr2-upscale",
      upscaleFactor: 2,
      upscaleCreativity: 0,
    });
    expect(valid.upscalePrompt).toBeUndefined();
    expect(() => validateInput({ ...upscale, generator: "video" })).toThrow(
      /upscales video only/,
    );
  });

  it("needs a Comfy key off a local ComfyUI", () => {
    expect(requiredKeyKind("seedvr2-upscale")).toBe("comfy");
    expect(() =>
      requireRoute("upscale", "seedvr2-upscale", "bfl-key-0001"),
    ).toThrow(/Comfy key/);
    expect(() =>
      requireRoute("upscale", "seedvr2-upscale", "comfyui-key-0001"),
    ).not.toThrow();
  });

  it("is estimated at FLUX Precise on Cloud and refused past the frame ceiling", () => {
    const source = { width: 1280, height: 720, duration: 5 };
    const valid = validateInput(upscale);
    expect(estimateRunUsd(valid, source)).toBe(estimateSeedvr2Usd(source, 2));
    expect(estimateSeedvr2Usd(source, 2)).toBe(
      estimateUpscaleUsd(source, 2, 0),
    );
    expect(() => requireSeedvr2Fit(source, 3)).not.toThrow();
    // 2560 × 1440 at 2× is 14.7 MP: the largest amount that fits is named.
    expect(() => requireSeedvr2Fit({ width: 2560, height: 1440 }, 2)).toThrow(
      /choose 1.9× or less/,
    );
  });

  it("runs the default template through workflowRun", () => {
    const valid = validateInput(upscale);
    const run = workflowRun("workflow/seedvr2-upscale", valid, "");
    expect(run.template).toBe(seedvr2Workflow);
    expect(run.values.scale).toBe(2);
  });
});

function catchError(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
