import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkGuideSizes,
  checkSchemas,
  checkStructure,
  listedModels,
  modelFiles,
} from "../scripts/lib/ui-workflow-check.mjs";

// The three end-to-end World Builder graphs (UI format, for the ComfyUI
// editor). The live /object_info check is `scripts/check-ui-workflows.mjs`;
// this suite holds what needs no server: link integrity, the model files the
// comfy-build lists name, the LoRA loaders, the Director nodes and the credit.
const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
type Node = {
  id: number;
  type: string;
  widgets_values?: unknown[];
  inputs?: { name: string; type: string; link: number | null }[];
  outputs?: { name: string; type: string; links: number[] | null }[];
};
type Workflow = {
  nodes: Node[];
  links: [number, number, number, number, number, string][];
  last_node_id: number;
  last_link_id: number;
};
const load = (name: string): Workflow =>
  JSON.parse(read(`workflows/${name}.json`));

const listed = listedModels(
  readdirSync(path.join(root, "comfy-build/models"))
    .filter((n) => n.endsWith(".txt"))
    .map((n) => read(`comfy-build/models/${n}`)),
);
const pack = JSON.parse(read("scripts/comfy-schemas/ltxvideo-220e1d4.json"));

const graphs = {
  "world-builder-akuspace-ltx": {
    lora: ["LoraLoaderModelOnly", "akuspace-ltx25-v0.5.safetensors"],
  },
  "world-builder-layout-to-render": {
    lora: [
      "LTXICLoRALoaderModelOnly",
      "ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors",
    ],
  },
  "world-builder-canny-depth": {
    lora: [
      "LTXICLoRALoaderModelOnly",
      "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors",
    ],
  },
} as const;

describe.each(Object.entries(graphs))("%s", (name, expected) => {
  const wf = load(name);
  const types = new Set(wf.nodes.map((n) => n.type));

  it("has consistent, type-matched links", () => {
    expect(checkStructure(wf)).toEqual([]);
  });

  it("matches the pinned LTXVideo pack schemas it uses", () => {
    const own = wf.nodes.filter((n) => pack[n.type]);
    if (expected.lora[0] === "LTXICLoRALoaderModelOnly")
      expect(own.length).toBeGreaterThan(1);
    const errors = checkSchemas({ ...wf, nodes: own }, pack);
    expect(errors.filter((e) => !e.endsWith("dangling"))).toEqual([]);
  });

  it("sizes every IC-LoRA guide and latent to multiples of 64", () => {
    expect(checkGuideSizes(wf)).toEqual([]);
  });

  it("names only model files from comfy-build lists", () => {
    const files = modelFiles(wf).map((m) => m.file);
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) expect(listed.has(file), file).toBe(true);
  });

  it("loads its LoRA", () => {
    const [cls, file] = expected.lora;
    const loader = wf.nodes.find((n) => n.type === cls);
    expect(loader?.widgets_values?.[0]).toBe(file);
    expect(loader?.outputs?.[0].links?.length).toBeGreaterThan(0);
  });

  it("starts at Capture and returns through the Director nodes", () => {
    for (const t of [
      "DirectorSceneCapture",
      "DirectorSceneAcoustics",
      "DirectorSceneReverb",
      "Koshi_AKUSPACEPrompt",
      "DirectorSceneInputs",
      "CreateVideo",
      "SaveVideo",
      "LoadAudio",
    ])
      expect(types.has(t), t).toBe(true);
  });

  it("credits the test track and never by personal name", () => {
    const text = JSON.stringify(wf);
    expect(text).toContain("Koshi Mosaic · Dimensions");
    expect(text).toContain("mix-track.mp3");
    expect(text).not.toMatch(new RegExp(atob("UnVkbmlja2l8UmFkZWs=")));
  });
});

describe("checkGuideSizes", () => {
  it("refuses a guide sized 960×544", () => {
    const wf = load("world-builder-canny-depth");
    const resize = wf.nodes.find((n) => n.type === "ResizeImageMaskNode")!;
    resize.widgets_values = ["scale dimensions", 960, 544, "center", "lanczos"];
    expect(checkGuideSizes(wf).join("\n")).toContain("960×544");
  });
});

describe("checkStructure", () => {
  it("catches a link whose type does not match its target", () => {
    const wf = load("world-builder-akuspace-ltx");
    const link = wf.links.find((l) => l[5] === "AUDIO")!;
    const target = wf.nodes.find((n) => n.id === link[3])!;
    target.inputs![link[4]].type = "IMAGE";
    expect(checkStructure(wf).join("\n")).toContain("AUDIO →");
  });
});
