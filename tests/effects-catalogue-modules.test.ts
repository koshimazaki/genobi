import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Layer, Parameters, Project } from "../shared/director/types";
import {
  catalogueEffectModules,
  catalogueEffects,
} from "../src/director/catalogue-effects";
import { validateProject } from "../src/director/validate";

function defaults(id: string): Parameters {
  const properties = catalogueEffectModules[id].parameterSchema
    .properties as unknown as Record<
    string,
    { default: string | number | boolean }
  >;
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, value.default]),
  );
}
function projectFor(id: string, override: Parameters = {}): Project {
  const module = structuredClone(catalogueEffectModules[id]);
  const base = {
    id: "effect-layer",
    name: "Editable effect",
    startFrame: 0,
    durationFrames: 120,
    locked: false,
    moduleId: id,
    parameters: { ...defaults(id), ...override },
  };
  const layer: Layer =
    module.mode === "filter"
      ? { ...base, kind: "filter", input: "composite-below" }
      : {
          ...base,
          kind: "graphics",
          opacity: 1,
          position: { x: 0, y: 0 },
          scale: 1,
          rotationDegrees: 0,
        };
  return {
    schemaVersion: "director.bundle.v1",
    id: "effects-contract-check",
    name: "Effects contract check",
    revision: 1,
    composition: {
      width: 960,
      height: 540,
      fps: 30,
      durationFrames: 120,
      colorSpace: "srgb",
      alpha: "straight",
      background: "#101519",
    },
    assets: {},
    modules: { [id]: module },
    layers: [layer],
    generationPlans: [],
    generations: [],
  };
}

describe("catalogue rendering contract", () => {
  for (const [id, module] of Object.entries(catalogueEffectModules)) {
    it(`${id} imports with the exact bundled source and portable parameters`, () => {
      const recipe = catalogueEffects[id];
      const bytes = readFileSync(
        `docs/director-bundle/effects-catalogue/${module.file.path}`,
      );
      const hash = createHash("sha256").update(bytes).digest("hex");
      expect(hash).toBe(module.file.sha256);
      expect(createHash("sha256").update(recipe.source).digest("hex")).toBe(
        hash,
      );
      expect(recipe.mode).toBe(module.mode);
      expect(typeof recipe.create).toBe("function");
      expect(validateProject(projectFor(id)).layers).toHaveLength(1);
    });
    it(`${id} rejects tampered source, widened schemas and nonfinite mix`, () => {
      const source = projectFor(id);
      source.modules[id].file.sha256 = "0".repeat(64);
      expect(() => validateProject(source)).toThrow(/Unregistered/);
      const schema = projectFor(id);
      schema.modules[id].parameterSchema.properties!.mix.maximum = 2;
      expect(() => validateProject(schema)).toThrow(/schema changed/);
      for (const mix of [-0.01, 1.01, NaN, Infinity])
        expect(() => validateProject(projectFor(id, { mix }))).toThrow();
    });
  }

  it("bounds geometric complexity and rejects unknown parameter payloads", () => {
    for (const [id, override] of [
      ["effects-poster-window", { levels: 2.5 }],
      ["effects-poster-window", { windowSize: 0 }],
      ["effects-scan", { speed: -1 }],
      ["effects-hud", { label: "x".repeat(49) }],
      ["effects-hud", { font: "url(https://example.com/font)" }],
      ["effects-kinetic-title", { shapeCount: 10000 }],
      ["effects-kinetic-title", { text: "x".repeat(81) }],
      ["effects-liquid-mirror", { folds: 6.5 }],
      ["effects-liquid-mirror", { unknown: 1 }],
    ] as [string, Parameters][])
      expect(() => validateProject(projectFor(id, override))).toThrow();
  });
});
