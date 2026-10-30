import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateProject } from "../src/director/validate";
import {
  active,
  editLayer,
  LAYER_LIMIT,
  visualAt,
  type Project,
} from "../shared/director/types";
const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL("../docs/director-bundle/example/studio.json", import.meta.url),
      "utf8",
    ),
  ) as Project;
describe("Director bundle timing and edits", () => {
  it("loads mixed audio/video/images/p5/Anime/Three project", () => {
    expect(validateProject(fixture()).layers).toHaveLength(9);
  });
  it("uses half-open boundaries and exact motion endpoints", () => {
    const p = fixture(),
      l = p.layers.find((l) => l.kind === "image")!;
    expect(active(l, l.startFrame - 1)).toBe(false);
    expect(active(l, l.startFrame)).toBe(true);
    expect(active(l, l.startFrame + l.durationFrames)).toBe(false);
    if ("opacity" in l) {
      expect(visualAt(l, l.startFrame).scale).toBe(1);
      expect(visualAt(l, l.startFrame + l.durationFrames - 1).scale).toBe(1.12);
    }
  });
  it("rejects stale edits and protects locked parameters and timing", () => {
    const p = fixture(),
      l = p.layers.find((l) => l.locked)!;
    expect(() => editLayer(p, l.id, { startFrame: 0 })).toThrow("Unlock");
    expect(() => editLayer(p, l.id, { locked: false, name: "bypass" })).toThrow(
      "Unlock",
    );
    expect(() => editLayer(p, l.id, { locked: false }, 0)).toThrow("changed");
    expect(
      editLayer(p, l.id, { locked: false }).layers.find((x) => x.id === l.id)
        ?.locked,
    ).toBe(false);
  });
  it("rejects weakened recipe schemas before executing graphics", () => {
    const p = fixture();
    p.modules.rings.parameterSchema = { type: "object" };
    const layer = p.layers.find((l) => l.id === "pulse")!;
    if ("parameters" in layer) layer.parameters.count = 10000000;
    expect(() => validateProject(p)).toThrow("schema changed");
  });
  it("replacement retains layer edits and refuses a shorter source", () => {
    const p = fixture();
    p.assets["replacement"] = { ...p.assets.video };
    const next = editLayer(p, "plate", { assetId: "replacement" });
    expect(next.layers.find((l) => l.id === "plate")).toEqual({
      ...p.layers.find((l) => l.id === "plate"),
      assetId: "replacement",
    });
    p.assets.replacement.durationSeconds = 1;
    expect(() => editLayer(p, "plate", { assetId: "replacement" })).toThrow(
      "Source too short",
    );
  });
  it("accepts microsecond-rounded media duration but rejects a missing frame", () => {
    const p = fixture();
    const layer = p.layers.find((l) => l.id === "plate")!;
    if (!("sourceStartFrame" in layer)) throw new Error("Expected media layer");
    p.composition.fps = 30;
    layer.sourceStartFrame = 0;
    layer.durationFrames = 97;
    p.assets[layer.assetId].durationSeconds = 3.233333;
    expect(() => validateProject(p)).not.toThrow();
    layer.durationFrames = 98;
    expect(() => validateProject(p)).toThrow("Source too short");
    layer.durationFrames = 97;
    p.assets[layer.assetId].durationSeconds = 3.233;
    expect(() => validateProject(p)).toThrow("Source too short");
  });
  it.each([
    "negative timing",
    "source overrun",
    "unknown module",
    "reference as image",
    "bad parameter",
    "unknown field",
    "missing provenance",
    "too many layers",
  ])("rejects %s", (kind) => {
    const p = fixture();
    if (kind === "negative timing") p.layers[0].startFrame = -1;
    if (kind === "source overrun" && "sourceStartFrame" in p.layers[0])
      p.layers[0].sourceStartFrame = 2;
    if (kind === "unknown module") {
      const l = p.layers.find((l) => l.kind === "filter")!;
      if ("moduleId" in l) l.moduleId = "missing";
    }
    if (kind === "reference as image") p.assets["image-1"].use = "reference";
    if (kind === "bad parameter") {
      const l = p.layers.find((l) => l.id === "crt-pass")!;
      if ("parameters" in l) l.parameters.curvature = 9;
    }
    if (kind === "unknown field")
      Object.assign(p.layers[0], { execute: "arbitrary code" });
    if (kind === "missing provenance") p.assets.video.origin = "generated";
    if (kind === "too many layers")
      p.layers = Array.from({ length: LAYER_LIMIT + 1 }, (_, i) => ({
        ...p.layers[0],
        id: `test-${i}`,
      }));
    expect(() => validateProject(p)).toThrow();
  });
});
