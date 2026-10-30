import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { danglingLinks, type ApiGraph } from "../shared/comfy/slots";
import i2v from "../docker/akuspace/workflows/akuspace-i2v.json";

// The Docker image itself is built by hand (docs/akuspace-docker.md); these
// check the files it is built from, which CI can read without a GPU.
const dir = "docker/akuspace";
const lines = (file: string) =>
  readFileSync(`${dir}/${file}`, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

const graphs = { i2v } as unknown as Record<string, ApiGraph>;
const node = (graph: ApiGraph, id: string) =>
  graph[id] as { class_type: string; inputs: Record<string, unknown> };

describe("the AKUSPACE Docker files", () => {
  it("link only to nodes the graphs hold", () => {
    for (const graph of Object.values(graphs)) {
      expect(danglingLinks(graph)).toEqual([]);
    }
  });

  it("feed the first frame into both passes of image to video", () => {
    const graph = graphs.i2v!;
    expect(node(graph, "93").inputs.latent).toEqual(["35", 0]);
    expect(node(graph, "39").inputs.video_latent).toEqual(["93", 0]);
    expect(node(graph, "94").inputs.latent).toEqual(["71", 0]);
    expect(node(graph, "72").inputs.video_latent).toEqual(["94", 0]);
    for (const id of ["93", "94"]) {
      expect(node(graph, id).class_type).toBe("LTXVImgToVideoInplace");
      expect(node(graph, id).inputs.bypass).toBe(false);
    }
    // The aligned reference and the distilled guidance stay as the Koshi graph has them.
    expect(node(graph, "42").class_type).toBe("AKUSPACEReferenceAudioAligned");
    for (const id of ["51", "81"]) {
      expect(node(graph, id).inputs).toMatchObject({
        video_cfg: 1,
        audio_cfg: 1,
      });
    }
  });

  it("download every model file the image-to-video graph loads", () => {
    const fetched = new Set(
      lines("models.txt").map((line) => {
        const [folder, url] = line.split(/\s+/);
        return `${folder}/${url!.split("/").pop()}`;
      }),
    );
    const loaders: Record<string, [string, string]> = {
      UNETLoader: ["diffusion_models", "unet_name"],
      CLIPLoader: ["text_encoders", "clip_name"],
      VAELoader: ["vae", "vae_name"],
      LoraLoaderModelOnly: ["loras", "lora_name"],
      LatentUpscaleModelLoader: ["latent_upscale_models", "model_name"],
    };
    const loaded = Object.values(graphs.i2v!).flatMap((entry) => {
      const { class_type, inputs } = entry as {
        class_type: string;
        inputs: Record<string, unknown>;
      };
      const loader = loaders[class_type];
      return loader ? [`${loader[0]}/${String(inputs[loader[1]])}`] : [];
    });
    expect(loaded).toHaveLength(6);
    for (const file of loaded) expect(fetched).toContain(file);
  });

  it("pin every custom node pack to a full commit", () => {
    const packs = lines("custom-nodes.lock").map((line) => line.split(/\s+/));
    expect(packs.map(([dir]) => dir)).toEqual([
      "Koshi-Nodes",
      "ComfyUI-LTXVideo",
    ]);
    for (const [, repo, commit] of packs) {
      expect(repo).toMatch(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
      expect(commit).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it("hold torchaudio to torch's own release", () => {
    const pins = Object.fromEntries(
      lines("constraints.txt").map((line) => line.split("==")),
    );
    expect(pins.torchaudio).toBe(pins.torch);
    expect(Object.keys(pins)).toEqual(["torch", "torchvision", "torchaudio"]);
  });
});
