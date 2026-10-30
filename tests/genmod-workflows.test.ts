import { describe, expect, it } from "vitest";
import {
  genmodAudioWorkflow,
  genmodControlWorkflow,
  genmodSize,
  genmodValues,
} from "../shared/comfy/genmod";
import { danglingLinks, fillSlots, isLink } from "../shared/comfy/slots";
import { nodeTypes } from "../shared/comfy/workflows";
import { GENMOD_SCHEMA, parseGenModRecipe } from "../shared/genmod/recipe";
import { genmodVideoPass } from "../shared/genmod/plan";

const templates = [genmodAudioWorkflow, genmodControlWorkflow];
const pass = (
  route: "control" | "audio",
  extra = {},
  frame = { width: 1280, height: 720 },
) =>
  genmodVideoPass(
    parseGenModRecipe({
      schema: GENMOD_SCHEMA,
      kind: "character",
      source: { assetId: "take", in: 0, out: 100 },
      firstFrame: { assetId: "still" },
      route,
      change: "the man is now the robot",
      action: "A man walks toward the camera, talking.",
      keep: ["camera", "performance"],
      audio: "keep",
      ...(route === "control" ? { control: { guide: "pose" } } : {}),
      ...extra,
    }),
    frame,
  );

describe("the Gen-Mod graphs", () => {
  it("are whole graphs whose slots name literal inputs", () => {
    for (const t of templates) {
      expect(danglingLinks(t.graph), t.id).toEqual([]);
      for (const [name, slot] of Object.entries(t.slots)) {
        const dot = slot.path.indexOf(".");
        const value =
          t.graph[slot.path.slice(0, dot)]?.inputs[slot.path.slice(dot + 1)];
        expect(value, `${t.id}.${name}`).toBeDefined();
        expect(isLink(value), `${t.id}.${name}`).toBe(false);
      }
      for (const node of t.requiredNodes) expect(nodeTypes(t)).toContain(node);
      for (const model of t.requiredModels)
        expect(JSON.stringify(t.graph)).toContain(model);
      expect(t.graph["75"].class_type).toBe("SaveVideo");
    }
  });

  it("keep no prompt enhancer and open on frame 0 at full strength", () => {
    for (const t of templates) {
      expect(nodeTypes(t)).not.toContain("TextGenerateLTX2Prompt");
      expect(t.graph["398:363"].inputs.value).toBe(false);
      expect(t.graph["398:357"].inputs.strength).toBe(1);
      expect(t.graph["398:364"].inputs.text).toEqual(["398:376", 0]);
    }
  });

  it("freeze the source soundtrack and mux the original back", () => {
    for (const t of templates) {
      const g = t.graph;
      expect(g["398:377"].inputs.audio_latent).toEqual(["906", 0]);
      expect(g["906"].inputs).toMatchObject({
        samples: ["904", 0],
        mask: ["905", 0],
      });
      expect(g["905"].inputs.value).toBe(0);
      expect(g["903"].inputs.audio).toEqual(["902", 1]);
      expect(g["398:370"].inputs.audio).toEqual(["903", 0]);
    }
  });

  it("guide stage 1 with the source pose and crop the guides before the upscale", () => {
    const g = genmodControlWorkflow.graph;
    expect(g["917"].inputs.image).toEqual(["914", 0]);
    expect(g["917"].inputs.iclora_parameters).toEqual(["916", 0]);
    expect(g["398:377"].inputs.video_latent).toEqual(["917", 2]);
    expect(g["398:388"].inputs.model).toEqual(["915", 0]);
    expect(g["398:348"].inputs.samples).toEqual(["918", 2]);
    expect(g["398:391"].inputs.positive).toEqual(["918", 0]);
    expect(genmodAudioWorkflow.graph).not.toHaveProperty("917");
  });
});

describe("Gen-Mod graph values", () => {
  it("fill the control graph from a planned pass", () => {
    const { template, values } = genmodValues(pass("control"), 29.97);
    expect(template.id).toBe("ltx-2-5-genmod-control");
    expect(values).toMatchObject({
      frames: 97,
      fps: 30,
      guide_strength: 1,
      width: 1280,
      height: 704,
    });
    expect(values.seconds).toBeCloseTo(97 / 30);
    const filled = fillSlots(template.graph, template.slots, {
      ...values,
      first_frame: "frame0.png",
      source: "source.mp4",
    });
    expect(filled["398:376"].inputs.value).toBe(values.prompt);
    expect(filled["398:378"].inputs.value).toBe(97);
    expect(filled["901"].inputs.file).toBe("source.mp4");
  });

  it("pick the audio graph for the audio route", () => {
    const { template, values } = genmodValues(pass("audio"), 24);
    expect(template.id).toBe("ltx-2-5-genmod-audio");
    expect(values).not.toHaveProperty("guide_strength");
    expect(() =>
      fillSlots(template.graph, template.slots, values),
    ).not.toThrow();
  });

  it("keep the source's framing: portrait, square and widescreen", () => {
    expect(genmodSize({ width: 720, height: 1280 }, 0.9)).toEqual({
      width: 704,
      height: 1280,
    });
    expect(genmodSize({ width: 1080, height: 1080 }, 0.9)).toEqual({
      width: 960,
      height: 960,
    });
    const tall = genmodValues(
      pass("audio", {}, { width: 1080, height: 1920 }),
      24,
    ).values;
    expect(tall.height).toBeGreaterThan(tall.width);
    for (const side of [tall.width, tall.height]) expect(side % 64).toBe(0);
    expect(genmodControlWorkflow.graph).not.toHaveProperty("403");
  });

  it("refuse isolation until the graph has it", () => {
    expect(() =>
      genmodValues(
        pass("control", { control: { guide: "pose", isolate: "the man" } }),
        24,
      ),
    ).toThrow("leave control.isolate out");
  });

  it("refuse what these graphs cannot run", () => {
    expect(() =>
      genmodValues(pass("control", { control: { guide: "depth" } }), 24),
    ).toThrow("pose");
    expect(() => genmodValues(pass("audio"), 0)).toThrow("frame rate");
  });
});

// Unsupported recipe choices must not silently change a paid pass's meaning.
it("refuses requested sound generation and SAM3 isolation before filling a graph", () => {
  expect(() =>
    genmodValues(pass("control", { audio: "generate" }), 24),
  ).toThrow("generated audio");
  expect(() =>
    genmodValues(
      pass("control", { control: { guide: "pose", isolate: "the person" } }),
      24,
    ),
  ).toThrow("isolation");
});
