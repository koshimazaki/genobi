import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { applyCommand, type DirectorCopy } from "../shared/director/commands";
import type { Project } from "../shared/director/types";
import { effectModules, effectRecipes } from "../src/director/effects";
import { validateProject } from "../src/director/validate";
import { effectsProject } from "./director-effects-harness";

// The motion effects are registered recipes on the same contract as the
// first six: the catalogue names each source by hash, the importer accepts
// only those bytes and schemas, and the existing Director commands check
// their parameters against the schema the catalogue declares.
const IDS = ["shake", "transition", "grade", "speed-lines", "styled-title"];
const sha = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const layerOf = (p: Project, moduleId: string) =>
  p.layers.find((l) => "moduleId" in l && l.moduleId === moduleId)!;
function withParameters(moduleId: string, parameters: Record<string, unknown>) {
  const p = effectsProject();
  const layer = layerOf(p, moduleId) as { parameters: Record<string, unknown> };
  Object.assign(layer.parameters, parameters);
  return p;
}
const copy = (): DirectorCopy => ({ project: effectsProject(), prompt: "" });
function ok(from: DirectorCopy, command: unknown) {
  const result = applyCommand(from, command);
  if (!result.ok) throw new Error(result.error);
  validateProject(result.copy.project);
  return result.copy;
}
const refusal = (from: DirectorCopy, command: unknown) => {
  const result = applyCommand(from, command);
  return result.ok ? "" : result.error;
};

describe("motion effects are registered recipes", () => {
  it("registers all five, each by the hash of its own source", () => {
    expect(Object.keys(effectModules).sort()).toEqual([...IDS].sort());
    expect(effectRecipes).toHaveLength(5);
    for (const [i, [id, m]] of Object.entries(effectModules).entries()) {
      const recipe = effectRecipes[i];
      expect(sha(recipe.source), id).toBe(m.file.sha256);
      const onDisk = readFileSync(
        `docs/director-bundle/effects/${m.file.path}`,
      );
      expect(createHash("sha256").update(onDisk).digest("hex")).toBe(
        m.file.sha256,
      );
      expect([recipe.engine, recipe.version, recipe.mode]).toEqual([
        m.engine,
        m.engineVersion,
        m.mode,
      ]);
      expect(typeof recipe.create).toBe("function");
    }
    const modes = Object.fromEntries(
      Object.entries(effectModules).map(([id, m]) => [id, m.mode]),
    );
    expect(modes).toEqual({
      shake: "filter",
      grade: "filter",
      transition: "overlay",
      "speed-lines": "overlay",
      "styled-title": "overlay",
    });
  });
  it("opens the worked example, which uses every effect", () => {
    const p = validateProject(effectsProject());
    for (const id of IDS) expect(layerOf(p, id)).toBeTruthy();
  });
  it("refuses a changed source or a widened schema", () => {
    const changed = effectsProject();
    changed.modules.shake.file.sha256 = "0".repeat(64);
    expect(() => validateProject(changed)).toThrow(/Unregistered/);
    const widened = effectsProject();
    widened.modules.transition.parameterSchema.properties!.type.enum!.push(
      "spin",
    );
    expect(() => validateProject(widened)).toThrow(/schema changed/);
  });
});

describe("motion effect parameters are validated on import", () => {
  const invalid: [string, Record<string, unknown>][] = [
    ["shake", { amplitude: 65 }],
    ["shake", { seed: 1.5 }],
    ["transition", { type: "dissolve" }],
    ["transition", { phase: "middle" }],
    ["transition", { direction: "diagonal" }],
    ["transition", { slices: 1 }],
    ["grade", { tint: "pink" }],
    ["grade", { gamma: 0 }],
    ["speed-lines", { direction: "spiral" }],
    ["speed-lines", { density: 161 }],
    ["styled-title", { font: "Comic Sans" }],
    ["styled-title", { ease: "outWobble" }],
    ["styled-title", { text: "x".repeat(81) }],
    ["styled-title", { plate: "yes" }],
    ["styled-title", { unknown: 1 }],
  ];
  for (const [id, parameters] of invalid)
    it(`${id} refuses ${JSON.stringify(parameters).slice(0, 40)}`, () => {
      expect(() => validateProject(withParameters(id, parameters))).toThrow(
        /Invalid parameters/,
      );
    });
});

describe("agents drive the effects with the existing commands", () => {
  it("set-parameters takes a valid choice and refuses the rest", () => {
    const next = ok(copy(), {
      op: "set-parameters",
      layerId: "slice-in",
      parameters: { type: "wipe", direction: "up", duration: 0.4 },
    });
    expect(
      (layerOf(next.project, "transition") as { parameters: object })
        .parameters,
    ).toMatchObject({ type: "wipe", direction: "up", duration: 0.4 });
    expect(
      refusal(copy(), {
        op: "set-parameters",
        layerId: "title",
        parameters: { ease: "outWobble" },
      }),
    ).toMatch(/must be one of/);
    expect(
      refusal(copy(), {
        op: "set-parameters",
        layerId: "impact",
        parameters: { amplitude: 500 },
      }),
    ).toMatch(/from 0 to 64/);
    expect(
      refusal(copy(), {
        op: "set-parameters",
        layerId: "grade",
        parameters: { tint: "red" },
      }),
    ).toMatch(/does not match/);
    expect(
      refusal(copy(), {
        op: "set-parameters",
        layerId: "lines",
        parameters: { angle: 3 },
      }),
    ).toMatch(/no parameter angle/);
  });
  it("add-graphic places another transition and filter from the ones in use", () => {
    let next = ok(copy(), {
      op: "add-graphic",
      layerId: "flash-2",
      moduleId: "transition",
      track: "transitions",
      startFrame: 100,
      durationFrames: 2,
    });
    next = ok(next, {
      op: "set-parameters",
      layerId: "flash-2",
      parameters: { type: "cut", phase: "in", duration: 0.06 },
    });
    next = ok(next, {
      op: "add-graphic",
      layerId: "impact-2",
      moduleId: "shake",
      track: "new",
      startFrame: 110,
      durationFrames: 10,
    });
    const added = next.project.layers.find((l) => l.id === "impact-2")!;
    expect(added.kind).toBe("filter");
    expect(next.project.layers.at(-1)?.id).toBe("impact-2");
  });
});
