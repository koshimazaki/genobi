import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCommand,
  parseCommand,
  type DirectorCopy,
} from "../shared/director/commands";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import { projectSummary } from "../mcp/director-tools";
import { ProjectCopies } from "../server/projects";
import {
  LAYER_LIMIT,
  type Layer,
  type Project,
} from "../shared/director/types";
import type { Bundle } from "../src/director/bundle";
import { applyEvent, pushCopy, readCopy } from "../src/director/project-copy";
import { validateProject } from "../src/director/validate";
import { base } from "./house-template-fixtures";
import { setup } from "./server-harness";

// add-graphic with its parameters: a recipe no layer uses yet, from the
// project's modules or the trusted registry, each value held to the recipe's
// own parameter schema.
const studio = (): Project =>
  JSON.parse(
    readFileSync("docs/director-bundle/example/studio.json", "utf8"),
  ) as Project;
const copy = (project = studio()): DirectorCopy => ({ project, prompt: "" });
/** The studio project without the CRT recipe or the layer that uses it. */
function withoutCrt(project = studio()): Project {
  const { crt: _crt, ...modules } = project.modules;
  return {
    ...project,
    modules,
    layers: project.layers.filter((l) => l.id !== "crt-pass"),
  };
}
function ok(from: DirectorCopy, command: unknown) {
  const result = applyCommand(from, command);
  if (!result.ok) throw new Error(result.error);
  validateProject(result.copy.project);
  return result.copy;
}
function refused(from: DirectorCopy, command: unknown) {
  const result = applyCommand(from, command);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}
const layer = (c: DirectorCopy, id: string) =>
  c.project.layers.find((l) => l.id === id) as Layer & {
    parameters: Record<string, unknown>;
  };
const caption = {
  text: "MORPHING TWINS",
  color: "#f2f2f2",
  size: 48,
  bpm: 120,
};
const add = (moduleId: string, parameters?: unknown) => ({
  op: "add-graphic",
  layerId: "added",
  moduleId,
  track: "new",
  startFrame: 30,
  durationFrames: 60,
  ...(parameters === undefined ? {} : { parameters }),
});

describe("add-graphic with parameters", () => {
  it("adds a recipe no layer uses yet with the parameters given", () => {
    const project = studio();
    expect(
      project.layers.some((l) => "moduleId" in l && l.moduleId === "caption"),
    ).toBe(false);
    const next = ok(copy(project), add("caption", caption));
    expect(layer(next, "added")).toMatchObject({
      kind: "graphics",
      moduleId: "caption",
      parameters: caption,
      opacity: 1,
    });
    // Without a layer to copy, every parameter the recipe requires is given.
    expect(refused(copy(), add("caption"))).toMatch(
      /No layer uses caption yet; give its parameters text, color, size, bpm/,
    );
    expect(refused(copy(), add("caption", { text: "HI" }))).toMatch(
      /give its parameters color, size, bpm/,
    );
  });

  it("holds each value to the recipe's type, length, range and pattern", () => {
    const check = (parameters: Record<string, unknown>) =>
      refused(copy(), add("caption", { ...caption, ...parameters }));
    expect(check({ size: 200 })).toMatch(/size must be from 8 to 96/);
    expect(check({ bpm: "fast" })).toMatch(/bpm must be a number/);
    expect(check({ text: "x".repeat(81) })).toMatch(/at most 80 characters/);
    expect(check({ color: "white" })).toMatch(/color does not match/);
    expect(check({ glow: true })).toMatch(/caption has no parameter glow/);
    expect(
      refused(copy(), add("rings", { color: "#ffffff", count: 2.5 })),
    ).toMatch(/whole number/);
    // Shape is refused before the project is read, as set-parameters is.
    expect(() =>
      parseCommand(add("caption", { ...caption, text: "x".repeat(201) })),
    ).toThrow(/at most 200 characters/);
    expect(() => parseCommand(add("caption", []))).toThrow(
      /parameters must be an object/,
    );
    // Control characters become spaces, as in set-parameters.
    const next = ok(copy(), add("caption", { ...caption, text: "A\u0007B" }));
    expect(layer(next, "added").parameters.text).toBe("A B");
  });

  it("puts the parameters given over the settings of a layer using the recipe", () => {
    const next = ok(copy(), add("rings", { count: 3 }));
    expect(layer(next, "added").parameters).toEqual({
      ...layer(copy(), "pulse").parameters,
      count: 3,
    });
    // Without parameters it still copies them, as before.
    expect(layer(ok(copy(), add("rings")), "added").parameters).toEqual(
      layer(copy(), "pulse").parameters,
    );
  });

  it("brings a recipe in from the trusted registry, exactly as defined there", () => {
    const from = copy(withoutCrt());
    const crt = { amount: 0.4, curvature: 0.1, rgb: 2, vignette: 0.5 };
    const next = ok(from, add("crt", crt));
    expect(next.project.modules.crt).toEqual(TRUSTED_RECIPES.crt);
    expect(layer(next, "added")).toMatchObject({
      kind: "filter",
      moduleId: "crt",
      parameters: crt,
      input: "composite-below",
    });
    // Filters stay on top.
    expect(next.project.layers.at(-1)?.id).toBe("added");
    expect(refused(from, add("crt"))).toMatch(/give its parameters/);
    expect(refused(from, add("crt", { ...crt, curvature: 0.5 }))).toMatch(
      /curvature must be from 0 to 0.3/,
    );
    expect(refused(from, add("sparkle", { amount: 1 }))).toMatch(
      /No recipe sparkle in this project or the registry; use one of rings, bars/,
    );
    // The recipe's file joins the bundle at the registry's path.
    const taken = withoutCrt();
    taken.assets.photo = {
      ...taken.assets.photo,
      file: { path: "graphics/three-crt.mjs", sha256: "0".repeat(64) },
    };
    expect(refused(copy(taken), add("crt", crt))).toMatch(
      /graphics\/three-crt.mjs already holds another file/,
    );
  });

  it("keeps to the layer limit", () => {
    const project = studio();
    const filler = project.layers.find((l) => l.id === "pulse")!;
    project.layers = [
      ...project.layers,
      ...Array.from(
        { length: LAYER_LIMIT - project.layers.length },
        (_, i) => ({ ...filler, id: `fill-${i}`, track: "pulse" }),
      ),
    ];
    expect(refused(copy(project), add("caption", caption))).toMatch(
      /at most 128 layers/,
    );
  });
});

describe("recipes an agent can add", () => {
  it("lists the project's recipes and the registry's others, each with its required names", () => {
    const summary = projectSummary({
      copyId: "signal-studies.abcdefghjk",
      id: "signal-studies",
      revision: 1,
      updatedAt: "2026-10-22T00:00:00.000Z",
      project: withoutCrt(),
      brief: null,
    });
    expect(summary.recipes.map((r) => r.moduleId)).not.toContain("crt");
    expect(summary.recipes.map((r) => r.moduleId)).toEqual(
      Object.keys(withoutCrt().modules),
    );
    const others = [
      "crt",
      "version-end-card-still",
      "version-gen-image",
      "version-space-hud",
    ];
    expect(summary.registryRecipes.map((r) => r.moduleId)).toEqual(others);
    for (const moduleId of others) {
      expect(summary.recipes.map((r) => r.moduleId)).not.toContain(moduleId);
      const recipe = TRUSTED_RECIPES[moduleId];
      expect(
        summary.registryRecipes.find((r) => r.moduleId === moduleId),
      ).toEqual({
        moduleId,
        mode: recipe.mode,
        parameters: recipe.parameterSchema.properties,
        required: recipe.parameterSchema.required,
      });
    }
    expect(summary.recipes.find((r) => r.moduleId === "caption")).toMatchObject(
      { mode: "overlay", required: ["text", "color", "size", "bpm"] },
    );
    expect(summary.registryRecipes.filter((r) => r.moduleId === "crt")).toEqual(
      [
        {
          moduleId: "crt",
          mode: "filter",
          parameters: TRUSTED_RECIPES.crt.parameterSchema.properties,
          required: ["amount", "curvature", "rgb", "vignette"],
        },
      ],
    );
  });
});

describe("a registry recipe through the project copy", () => {
  it("stores the recipe's file, so the studio reloads it and pushes again", async () => {
    const harness = await setup();
    const fetcher = ((input: string, init: RequestInit = {}) =>
      fetch(`${harness.base}${input}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          cookie: harness.cookie,
        },
      })) as typeof fetch;
    const full = base();
    const crtPath = full.project.modules.crt.file.path;
    const files = new Map(full.files);
    files.delete(crtPath);
    const bundle: Bundle = { project: withoutCrt(full.project), files };
    expect(await pushCopy(bundle, null, new Set(), fetcher)).toMatchObject({
      ok: true,
    });
    const command = add("crt", {
      amount: 0.4,
      curvature: 0.1,
      rgb: 2,
      vignette: 0.5,
    });
    const response = await fetcher(
      `/api/projects/${bundle.project.id}/commands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRevision: 1, command }),
      },
    );
    expect(response.status).toBe(200);
    // The studio has no bytes for the recipe, so it reloads instead.
    expect(
      applyEvent(bundle, {
        projectId: bundle.project.id,
        revision: 2,
        baseRevision: 1,
        source: "command",
        command: command as never,
      }),
    ).toBeUndefined();
    const read = await readCopy(bundle.project.id, bundle, fetcher);
    expect(read.project.modules.crt).toEqual(TRUSTED_RECIPES.crt);
    expect(read.files.get(crtPath)).toEqual(full.files.get(crtPath));
    // The reloaded studio builds on it.
    const next = {
      ...read,
      project: { ...read.project, revision: 3, name: "With CRT" },
    };
    expect(await pushCopy(next, 2, new Set(), fetcher)).toEqual({
      ok: true,
      revision: 3,
    });
  });
});

const crtParameters = { amount: 0.4, curvature: 0.1, rgb: 2, vignette: 0.5 };
const event = (bundle: Bundle, command: unknown) => ({
  projectId: bundle.project.id,
  revision: bundle.project.revision + 1,
  baseRevision: bundle.project.revision,
  source: "command" as const,
  command: command as never,
});

describe("bytes a registry recipe brings", () => {
  it("does not trust a file the bundle holds at the recipe's path but never named", () => {
    const full = base();
    const crtPath = full.project.modules.crt.file.path;
    // An imported ZIP may carry an unreferenced file at that path.
    const files = new Map(full.files);
    files.set(crtPath, new TextEncoder().encode("export const x = 1;\n"));
    const bundle: Bundle = { project: withoutCrt(full.project), files };
    expect(
      applyEvent(bundle, event(bundle, add("crt", crtParameters))),
    ).toBeUndefined();
    // Even the right bytes were never checked against the hash: reload.
    const right: Bundle = {
      project: withoutCrt(full.project),
      files: full.files,
    };
    expect(
      applyEvent(right, event(right, add("crt", crtParameters))),
    ).toBeUndefined();
    // A recipe the bundle names keeps applying in place.
    expect(
      applyEvent(full, event(full, add("rings", { count: 3 }))),
    ).toMatchObject({ project: { revision: full.project.revision + 1 } });
  });

  const temporary: string[] = [];
  afterEach(async () => {
    for (const dir of temporary.splice(0))
      await rm(dir, { recursive: true, force: true });
  });
  const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const sha = (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");

  it("holds the copy to its limit when the recipe's file was already staged", async () => {
    const full = base();
    const crt = full.files.get(full.project.modules.crt.file.path)!;
    const project = withoutCrt(full.project);
    const named = new Map<string, Uint8Array>();
    for (const item of [
      ...Object.values(project.assets),
      ...Object.values(project.modules),
    ])
      named.set(item.file.sha256, full.files.get(item.file.path)!);
    const total = [...named.values()].reduce((n, b) => n + b.length, 0);
    const store = async (limit: number, stage: boolean) => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "genobi-recipe-test-"));
      temporary.push(dir);
      const copies = new ProjectCopies(dir, limit);
      await copies.load();
      const upload = (bytes: Uint8Array) =>
        copies.putFile(project.id, SESSION, sha(bytes), Buffer.from(bytes));
      for (const bytes of named.values()) await upload(bytes);
      await copies.put(project.id, SESSION, {
        baseRevision: null,
        project,
        brief: null,
      });
      // Staged for a next push: alone it fits beside the current copy.
      if (stage) expect(await upload(crt)).toEqual({ stored: true });
      return copies.command(project.id, SESSION, {
        baseRevision: 1,
        command: add("crt", crtParameters),
      });
    };
    const over = total + crt.length - 1;
    for (const stage of [false, true])
      await expect(store(over, stage)).rejects.toMatchObject({
        status: 413,
        code: "project_too_large",
      });
    for (const stage of [false, true])
      await expect(store(total + crt.length, stage)).resolves.toMatchObject({
        revision: 2,
      });
  });
});
