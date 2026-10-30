import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  parseCommand,
  type DirectorCopy,
} from "../shared/director/commands";
import {
  CLIP_PROMPT_LIMIT,
  GLOBAL_PROMPT_LIMIT,
  LENSES,
  SHOT_TYPES,
  SUBJECT_ACTIONS,
} from "../shared/director/directions";
import { duplicateLayer } from "../shared/director/duplicate";
import { splitLayer } from "../shared/director/split";
import { reorderLane } from "../shared/director/tracks";
import type { Layer, Project } from "../shared/director/types";
import { bundleZip, importBundle } from "../src/director/bundle";
import { manifestText, readManifest } from "../src/director/manifest";
import { validateProject } from "../src/director/validate";
import { base } from "./house-template-fixtures";

// The prompt contract (issue #178): one global prompt per project, and per
// clip its own prompt and typed directions, optional and validated wherever a
// project is, through the same commands the studio and agents send.
const studio = (): Project => base().project;
const camera = { "shot-sizes": "wide", angles: null, movements: "orbit" };
const directed = (): Project => {
  const p = studio();
  return {
    ...p,
    globalPrompt: "A lone traveller crosses the gate.\nKeep the mist.",
    layers: p.layers.map((l) =>
      l.id === "plate"
        ? ({
            ...l,
            prompt: "Reveal the gate from below.",
            directions: { shot: "wide", lens: "24mm", camera, action: "rise" },
          } as Layer)
        : l,
    ),
  };
};
const copy = (project = studio()): DirectorCopy => ({ project, prompt: "" });
function ok(from: DirectorCopy, command: unknown) {
  const result = applyCommand(from, command);
  if (!result.ok) throw new Error(result.error);
  validateProject(result.copy.project);
  return result.copy;
}
function refused(from: DirectorCopy, command: unknown) {
  const result = applyCommand(from, command);
  expect(result.ok, JSON.stringify(command)).toBe(false);
  return result.ok ? "" : result.error;
}
const plate = (p: Project) => p.layers.find((l) => l.id === "plate")!;
const withPlate = (patch: Record<string, unknown>) => ({
  ...studio(),
  layers: studio().layers.map((l) =>
    l.id === "plate" ? { ...l, ...patch } : l,
  ),
});

describe("the prompt fields in the bundle schema", () => {
  it("opens an older bundle unchanged and accepts both prompt scopes", () => {
    const old = studio();
    expect(old).not.toHaveProperty("globalPrompt");
    expect(old.layers.some((l) => "prompt" in l || "directions" in l)).toBe(
      false,
    );
    expect(validateProject(structuredClone(old))).toEqual(old);
    expect(validateProject(directed())).toEqual(directed());
    // Every layer kind takes them, audio and filters included.
    for (const id of ["score", "photo-1", "pulse", "finish"])
      expect(() =>
        validateProject({
          ...studio(),
          layers: studio().layers.map((l) =>
            l.id === id
              ? { ...l, prompt: "x", directions: { lens: "50mm" } }
              : l,
          ),
        }),
      ).not.toThrow();
  });

  it("refuses bad types, lengths, control characters and unknown values", () => {
    const bad: unknown[] = [
      { ...studio(), globalPrompt: 7 },
      { ...studio(), globalPrompt: "" },
      { ...studio(), globalPrompt: "x".repeat(GLOBAL_PROMPT_LIMIT + 1) },
      { ...studio(), globalPrompt: "bell\x07" },
      { ...studio(), globalPrompt: "tab\there" },
      withPlate({ prompt: "x".repeat(CLIP_PROMPT_LIMIT + 1) }),
      withPlate({ prompt: ["a"] }),
      withPlate({ prompt: "esc\x1b[31m" }),
      withPlate({ directions: {} }),
      withPlate({ directions: { shot: "Wide" } }),
      withPlate({ directions: { lens: "16mm" } }),
      withPlate({ directions: { action: "teleport" } }),
      withPlate({ directions: { mood: "calm" } }),
      withPlate({ directions: { camera: { movements: "orbit" } } }),
      // A camera term Genobi does not offer: the schema cannot see it.
      withPlate({ directions: { camera: { ...camera, movements: "warp" } } }),
    ];
    for (const value of bad)
      expect(() => validateProject(value), JSON.stringify(value)).toThrow();
    // Line breaks are the one control character a prompt keeps.
    expect(() =>
      validateProject({ ...studio(), globalPrompt: "one\ntwo" }),
    ).not.toThrow();
    expect(() =>
      validateProject(withPlate({ prompt: "x".repeat(CLIP_PROMPT_LIMIT) })),
    ).not.toThrow();
  });

  it("enumerates exactly the shared vocabulary", () => {
    const schema = JSON.parse(
      readFileSync("docs/director-bundle/schema/layers.schema.json", "utf8"),
    );
    const props = schema.definitions.directions.properties;
    const ids = (list: readonly { id: string }[]) => list.map((c) => c.id);
    expect(props.shot.enum).toEqual(ids(SHOT_TYPES));
    expect(props.lens.enum).toEqual(ids(LENSES));
    expect(props.action.enum).toEqual(ids(SUBJECT_ACTIONS));
    expect(schema.definitions.clipPrompt.maxLength).toBe(CLIP_PROMPT_LIMIT);
  });
});

describe("prompts survive Save JSON, Download bundle and reopen", () => {
  it("keeps both scopes through the manifest", () => {
    const text = manifestText(directed());
    expect(readManifest(new TextEncoder().encode(text))).toEqual(directed());
  });

  it("keeps both scopes through a bundle, and an old bundle stays bare", async () => {
    const bundle = { ...base(), project: directed() };
    const reopened = await importBundle(
      new File([new Uint8Array(bundleZip(bundle))], "saved.zip"),
    );
    expect(reopened.project).toEqual(directed());
    const old = await importBundle(
      new File([new Uint8Array(bundleZip(base()))], "old.zip"),
    );
    expect(old.project).not.toHaveProperty("globalPrompt");
    expect(plate(old.project)).not.toHaveProperty("prompt");
  });
});

describe("the prompt commands", () => {
  it("parses the three commands and refuses what the schema would", () => {
    expect(parseCommand({ op: "set-global-prompt", text: "a\tb\nc" })).toEqual({
      op: "set-global-prompt",
      text: "a b\nc",
    });
    expect(
      parseCommand({
        op: "set-clip-directions",
        layerId: "plate",
        directions: { shot: "wide", camera: { movements: "orbit" } },
      }),
    ).toEqual({
      op: "set-clip-directions",
      layerId: "plate",
      directions: {
        shot: "wide",
        camera: { "shot-sizes": null, angles: null, movements: "orbit" },
      },
    });
    const bad: [unknown, RegExp][] = [
      [{ op: "set-global-prompt" }, /needs text/],
      [{ op: "set-global-prompt", text: 4 }, /at most 12000/],
      [
        { op: "set-global-prompt", text: "x".repeat(GLOBAL_PROMPT_LIMIT + 1) },
        /at most 12000/,
      ],
      [
        {
          op: "set-clip-prompt",
          layerId: "plate",
          text: "x".repeat(CLIP_PROMPT_LIMIT + 1),
        },
        /at most 1200/,
      ],
      [{ op: "set-clip-prompt", layerId: "Plate!", text: "x" }, /lowercase/],
      [{ op: "set-clip-prompt", text: "x" }, /needs layerId/],
      [
        { op: "set-clip-directions", layerId: "plate", directions: {} },
        /needs shot/,
      ],
      [
        { op: "set-clip-directions", layerId: "plate", directions: "wide" },
        /must be an object/,
      ],
      [
        {
          op: "set-clip-directions",
          layerId: "plate",
          directions: { lens: "16mm" },
        },
        /lens must be one of/,
      ],
      [
        {
          op: "set-clip-directions",
          layerId: "plate",
          directions: { mood: "x" },
        },
        /no field mood/,
      ],
      [
        {
          op: "set-clip-directions",
          layerId: "plate",
          directions: { camera: { movements: "warp" } },
        },
        /no term warp/,
      ],
      [
        { op: "set-clip-prompt", layerId: "plate", text: "x", extra: 1 },
        /does not take extra/,
      ],
    ];
    for (const [command, error] of bad)
      expect(() => parseCommand(command), JSON.stringify(command)).toThrow(
        error,
      );
  });

  it("sets and clears each field without touching the others", () => {
    let c = ok(copy(), { op: "set-global-prompt", text: "Cold mist" });
    expect(c.project.globalPrompt).toBe("Cold mist");
    c = ok(c, { op: "set-clip-prompt", layerId: "plate", text: "Slow reveal" });
    c = ok(c, {
      op: "set-clip-directions",
      layerId: "plate",
      directions: { shot: "wide", lens: "35mm" },
    });
    // A menu change keeps the authored words, and the words keep the menu.
    c = ok(c, {
      op: "set-clip-directions",
      layerId: "plate",
      directions: { lens: null, action: "hold" },
    });
    expect(plate(c.project)).toMatchObject({
      prompt: "Slow reveal",
      directions: { shot: "wide", action: "hold" },
    });
    c = ok(c, { op: "set-clip-prompt", layerId: "plate", text: "Faster" });
    expect(plate(c.project).directions).toEqual({
      shot: "wide",
      action: "hold",
    });
    // Blank text and the last direction cleared remove the fields.
    c = ok(c, { op: "set-clip-prompt", layerId: "plate", text: "  " });
    c = ok(c, {
      op: "set-clip-directions",
      layerId: "plate",
      directions: { shot: null, action: null },
    });
    c = ok(c, { op: "set-global-prompt", text: "" });
    expect({ ...c.project, revision: 1 }).toEqual(studio());
  });

  it("refuses a locked or unknown clip, and never touches generation", () => {
    expect(
      refused(copy(), { op: "set-clip-prompt", layerId: "labels", text: "x" }),
    ).toMatch(/Unlock/);
    expect(
      refused(copy(), {
        op: "set-clip-directions",
        layerId: "nope",
        directions: { lens: "50mm" },
      }),
    ).toMatch(/not found|No layer/i);
    const before = directed();
    const after = ok(copy(before), {
      op: "set-clip-prompt",
      layerId: "plate",
      text: "Regenerate this with rain",
    }).project;
    expect(after.generationPlans).toEqual(before.generationPlans);
    expect(after.generations).toEqual(before.generations);
    expect(after.assets).toEqual(before.assets);
  });
});

describe("prompts follow their clip through edits", () => {
  it("keeps the prompt and directions on both sides of a split", () => {
    const p = directed();
    const l = plate(p);
    const next = splitLayer(p, "plate", l.startFrame + 10, "plate-b");
    for (const id of ["plate", "plate-b"])
      expect(next.layers.find((x) => x.id === id)).toMatchObject({
        prompt: l.prompt,
        directions: l.directions,
      });
    // Edited independently afterwards.
    const edited = ok(copy(next), {
      op: "set-clip-prompt",
      layerId: "plate-b",
      text: "Only the second half",
    }).project;
    expect(plate(edited).prompt).toBe(l.prompt);
  });

  it("copies them to a duplicate under a new id", () => {
    const p = directed();
    const next = duplicateLayer(p, "plate", "plate-copy");
    const dup = next.layers.at(-1)!;
    expect(dup.id).toBe("plate-copy");
    expect(dup).toMatchObject({
      prompt: plate(p).prompt,
      directions: plate(p).directions,
      locked: false,
    });
    expect(dup.directions).not.toBe(plate(p).directions);
    expect(() => duplicateLayer(p, "plate", "plate")).toThrow(/taken/);
  });

  it("never moves them to another clip on a reorder", () => {
    const p = directed();
    const before = new Map(p.layers.map((l) => [l.id, l.prompt]));
    for (const delta of [1, -1] as const) {
      const layers = reorderLane(p.layers, "plate", delta);
      for (const l of layers) expect(l.prompt).toBe(before.get(l.id));
    }
  });
});
