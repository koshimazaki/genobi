import { describe, expect, it } from "vitest";
import graph from "../workflows/minimax-music-3.json";
import { validateInput } from "../server/validation";
import { AppError } from "../server/errors";
import { fitControls, musicControls } from "../shared/controls";
import { canonicalInput } from "../shared/idempotency";
import { CREDITS_PER_USD } from "../shared/comfy/ltx";
import { musicValues, musicWorkflow } from "../shared/comfy/music";
import { workflowOutput, workflowRun } from "../shared/comfy/runs";
import { danglingLinks, fillSlots, isLink } from "../shared/comfy/slots";
import {
  requireTemplateFor,
  workflowCatalogue,
} from "../shared/comfy/workflows";
import { MUSIC_ESTIMATE_CREDITS } from "../shared/music";
import { composePrompt } from "../shared/presets";
import { missingKeyError, requireRoute } from "../shared/provider";
import { estimateRunUsd } from "../shared/quote";
import {
  entriesFor,
  entryFor,
  familiesFor,
  readyEntry,
} from "../shared/registry";

const request = {
  generator: "audio",
  model: "minimax-music-3",
  description: "  Lo-fi hip-hop, 78 BPM, warm Rhodes, no vocals.  ",
  lyrics: "[Intro]\n[Instrumental]\n",
  duration: 30,
};
const refusal = (body: object) => {
  try {
    validateInput(body);
  } catch (error) {
    return (error as AppError).message;
  }
  return null;
};

describe("MiniMax Music 3: the graph", () => {
  it("keeps the official template's nodes, values and Cloud weight names", () => {
    expect(danglingLinks(musicWorkflow.graph)).toEqual([]);
    expect(musicWorkflow.requiredNodes.sort()).toEqual(
      [
        "CLIPLoader",
        "ComfySwitchNode",
        "ConditioningZeroOut",
        "EmptyMiniMaxMusic3LatentAudio",
        "KSampler",
        "MiniMaxMusic3TextEncode",
        "SaveAudioAdvanced",
        "SeedNode",
        "UNETLoader",
        "VAEDecodeAudio",
        "VAEDecodeAudioTiled",
        "VAELoader",
      ].sort(),
    );
    // As this account's Cloud object_info listed them on 27 October 2026.
    expect(musicWorkflow.requiredModels).toEqual([
      "minimax_music3_dit_fp16.safetensors",
      "minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
      "minimax_music3_dav.safetensors",
    ]);
    expect(graph["37:3"].inputs.type).toBe("minimax");
    expect(graph["37:9"].inputs).toMatchObject({
      steps: 30,
      cfg: 1.7,
      sampler_name: "euler",
      scheduler: "simple",
      denoise: 1,
    });
    expect(graph["37:13"].inputs).toMatchObject({ cfg_scale: 1.7, top_k: 50 });
    // The template's tiled decode stays on; its latent length is the encoder's.
    expect(graph["37:43"].inputs.switch).toBe(true);
    expect(graph["37:15"].inputs.seconds).toEqual(["37:13", 1]);
    // One seed drives the encoder and the sampler.
    expect(graph["37:13"].inputs.seed).toEqual(["37:38", 0]);
    expect(graph["37:9"].inputs.seed).toEqual(["37:38", 0]);
    expect(graph["35"]).toMatchObject({
      class_type: "SaveAudioAdvanced",
      inputs: { audio: ["37:43", 0], format: "mp3", "format.quality": "V0" },
    });
    // The template's example song is not shipped.
    expect(graph["37:13"].inputs.lyrics).toBe("");
    expect(JSON.stringify(graph)).not.toMatch(/Lo-fi|Midnight and the canvas/);
  });

  it("names a literal at every slot and reads its song from SaveAudioAdvanced", () => {
    for (const [name, slot] of Object.entries(musicWorkflow.slots)) {
      const [node, input] = [
        slot.path.slice(0, slot.path.indexOf(".")),
        slot.path.slice(slot.path.indexOf(".") + 1),
      ];
      const value = (
        musicWorkflow.graph[node]?.inputs as Record<string, unknown>
      )?.[input];
      expect(value, name).toBeDefined();
      expect(isLink(value), name).toBe(false);
    }
    expect(workflowOutput("workflow/minimax-music-3")).toEqual({
      nodeId: "35",
      media: "audio",
    });
    expect(requireTemplateFor("minimax-music-3").capability).toBe(
      "text-to-music",
    );
  });

  it("fills caption, lyrics, seconds and a fresh seed from the request", () => {
    const input = validateInput(request);
    const { template, values } = workflowRun(
      "workflow/minimax-music-3",
      input,
      composePrompt(input),
    );
    expect(values).toEqual({
      caption: "Lo-fi hip-hop, 78 BPM, warm Rhodes, no vocals.",
      lyrics: "[Intro]\n[Instrumental]",
      duration: 30,
      seed: expect.any(Number),
    });
    const filled = fillSlots(template.graph, template.slots, values);
    expect(filled["37:13"].inputs).toMatchObject({
      caption: "Lo-fi hip-hop, 78 BPM, warm Rhodes, no vocals.",
      lyrics: "[Intro]\n[Instrumental]",
      max_duration: 30,
    });
    expect(filled["37:38"].inputs.seed).toBe(values.seed);
    // The requested seconds are a ceiling, not the song's length. The encoder
    // samples until it emits its end token, and the DiT pads any latent past
    // that with zero conditioning (ComfyUI `comfy/ldm/minimax_music/ar.py`,
    // `dit.py`), so the latent keeps the encoder's measured `seconds` output
    // rather than a forced literal that would only add an unconditioned tail.
    expect(filled["37:15"].inputs.seconds).toEqual(["37:13", 1]);
    expect(Object.values(template.slots).map((s) => s.path)).not.toContain(
      "37:15.seconds",
    );
    // The template itself is never changed.
    expect(musicWorkflow.graph["37:13"].inputs.max_duration).toBe(60);
    const seeds = [0.1, 0.9].map((n) => musicValues(input, "x", () => n).seed);
    expect(seeds[0]).not.toBe(seeds[1]);
    expect(Number.isSafeInteger(seeds[1])).toBe(true);
  });
});

describe("MiniMax Music 3: the request", () => {
  it("is an audio entry with caption, lyrics and duration controls", () => {
    const entry = readyEntry("minimax-music-3")!;
    expect(entry).toMatchObject({
      generator: "audio",
      route: "workflow",
      model: "workflow/minimax-music-3",
      family: "h3",
      open: true,
      camera: null,
      controls: { kind: "audio", duration: { min: 5, max: 120 }, lyrics: true },
    });
    expect(entryFor("audio").id).toBe("minimax-music-3");
    expect(entryFor("audio", "flux-3").id).toBe("minimax-music-3");
    // Local only: the hosted studio keeps the H3 family but not Music 3,
    // and its catalogue lists no music entry, capability or template.
    expect(entry.localOnly).toBe(true);
    const ids = (entries: { id: string }[]) => entries.map((e) => e.id);
    expect(ids(entriesFor("h3"))).toContain("minimax-music-3");
    expect(familiesFor({ hosted: true })).toContain("h3");
    expect(ids(entriesFor("h3", { hosted: true }))).not.toContain(
      "minimax-music-3",
    );
    const local = workflowCatalogue();
    const hosted = workflowCatalogue(undefined, true);
    expect(local.entries.map((e) => e.entry)).toContain("minimax-music-3");
    expect(hosted.entries.map((e) => e.entry)).not.toContain("minimax-music-3");
    expect(hosted.capabilities.map((c) => c.id)).not.toContain("text-to-music");
    expect(hosted.templates.map((t) => t.id)).not.toContain("minimax-music-3");
    // Music's template and the swap's, both local-only, are the ones gone.
    expect(
      local.templates
        .map((t) => t.id)
        .filter((id) => !hosted.templates.some((t) => t.id === id)),
    ).toEqual(["openjutsu-swap", "minimax-music-3"]);
    // Only the length is a song's; everything else stays parked.
    const parked = { duration: 3, aspectRatio: "21:9", draft: true } as const;
    expect(
      fitControls(musicControls, {
        ...parked,
        resolution: "uhd",
        cameraEnabled: true,
      }),
    ).toMatchObject({ ...parked, duration: 5 });
  });

  it("keeps the caption, lyrics and seconds and drops what a song cannot use", () => {
    const input = validateInput({
      ...request,
      camera: { movements: "orbit" },
      sourceId: "job-1",
      imageReferences: ["data:image/png;base64,AAAA"],
      acoustic: { mode: "room", preset: "empty_club", level: "high" },
    });
    expect(input).toEqual({
      generator: "audio",
      model: "minimax-music-3",
      description: "Lo-fi hip-hop, 78 BPM, warm Rhodes, no vocals.",
      lyrics: "[Intro]\n[Instrumental]",
      cameraEnabled: false,
      duration: 30,
      resolution: "hd",
      aspectRatio: "16:9",
      draft: false,
      upscaleFactor: 2,
      upscaleCreativity: 0,
    });
    expect(validateInput({ ...request, lyrics: undefined }).lyrics).toBe("");
    expect(composePrompt(input)).toBe(input.description);
  });

  it("refuses captions, lyrics and lengths outside the bounds", () => {
    expect(refusal({ ...request, description: " " })).toMatch(/Describe/);
    expect(refusal({ ...request, description: "x".repeat(2001) })).toMatch(
      /2,000/,
    );
    expect(refusal({ ...request, description: "a\u0000b" })).toMatch(
      /Describe/,
    );
    expect(refusal({ ...request, lyrics: "x".repeat(3001) })).toMatch(/3,000/);
    expect(refusal({ ...request, lyrics: 7 })).toMatch(/lyrics/);
    expect(refusal({ ...request, lyrics: "\u001b[31m" })).toMatch(/lyrics/);
    for (const duration of [4, 121, 20.5, "20", undefined])
      expect(refusal({ ...request, duration }), String(duration)).toMatch(
        /between 5 and 120/,
      );
    expect(refusal({ ...request, model: "flux-3" })).toMatch(/MiniMax Music/);
    // The music model is not a video model.
    expect(refusal({ ...request, generator: "video" })).toMatch(/Choose/);
    expect(refusal({ ...request, duration: 5 })).toBeNull();
    expect(refusal({ ...request, duration: 120 })).toBeNull();
    expect(refusal({ ...request, lyrics: "x".repeat(3000) })).toBeNull();
  });

  it("hashes lyrics into a song's settings and leaves every other hash alone", () => {
    const song = validateInput(request);
    expect(canonicalInput(song)).not.toBe(
      canonicalInput({ ...song, lyrics: "[verse]" }),
    );
    const video = {
      generator: "video",
      description: "A vessel.",
      cameraEnabled: false,
      duration: 5,
      resolution: "hd",
      draft: false,
      upscaleFactor: 2,
    } as const;
    expect(canonicalInput(video)).not.toContain("lyrics");
  });

  it("is priced by the provisional GPU allowance and needs a Comfy key", () => {
    const input = validateInput(request);
    expect(estimateRunUsd(input)).toBeCloseTo(
      (240 * 0.266) / CREDITS_PER_USD,
      10,
    );
    expect(MUSIC_ESTIMATE_CREDITS).toBeCloseTo(63.84, 10);
    expect(() => requireRoute("audio", "minimax-music-3", "bfl-key")).toThrow(
      /Connect a Comfy key/,
    );
    expect(() =>
      requireRoute("audio", "minimax-music-3", "comfyui-music-key-01"),
    ).not.toThrow();
    expect(missingKeyError("minimax-music-3").message).toBe(
      "Connect a Comfy key first.",
    );
  });
});
