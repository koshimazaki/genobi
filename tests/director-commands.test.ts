import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cameraSections, termsFor } from "../shared/camera";
import {
  applyCommand,
  DIRECTOR_OPS,
  parseCommand,
  type DirectorCopy,
} from "../shared/director/commands";
import type { Project } from "../shared/director/types";
import { houseTemplates } from "../shared/templates/catalogue";
import { planTemplate } from "../shared/templates/plan";
import { buildTemplateBundle } from "../src/director/house-template";
import { validateProject } from "../src/director/validate";
import { base, samples } from "./house-template-fixtures";

const studio = (): Project =>
  JSON.parse(
    readFileSync("docs/director-bundle/example/studio.json", "utf8"),
  ) as Project;
const copyOf = (project: Project, prompt = ""): DirectorCopy => ({
  project,
  prompt,
});
/** Apply and expect success; the result also passes the bundle validators. */
function ok(copy: DirectorCopy, command: unknown) {
  const result = applyCommand(copy, command);
  if (!result.ok) throw new Error(result.error);
  validateProject(result.copy.project);
  expect(result.copy.project.revision).toBe(copy.project.revision + 1);
  return result.copy;
}
function refused(copy: DirectorCopy, command: unknown) {
  const result = applyCommand(copy, command);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

describe("parsing Director commands", () => {
  it("names the supported commands", () => {
    expect(DIRECTOR_OPS).toEqual([
      "add-clip",
      "add-graphic",
      "move-clip",
      "trim-clip",
      "set-prompt",
      "set-preferences",
      "set-camera",
      "set-template-inputs",
      "replace-plate",
      "set-placement",
      "set-parameters",
      "set-beat-grid",
      "set-resolution",
      "remove-clip",
      "duplicate-clip",
      "split-clip",
      "set-muted",
      "set-gain",
      "set-global-prompt",
      "set-clip-prompt",
      "set-clip-directions",
      "add-note",
      "resolve-note",
      "delete-note",
    ]);
  });

  it("refuses unknown ops, missing and extra fields, bad ids and bad numbers", () => {
    const move = { op: "move-clip", layerId: "plate", startFrame: 10 };
    expect(parseCommand(move)).toEqual(move);
    for (const bad of [
      null,
      [],
      { op: "delete-everything" },
      { op: "move-clip", layerId: "plate" },
      { ...move, extra: 1 },
      { ...move, layerId: "../plate" },
      { ...move, layerId: "Plate" },
      { ...move, startFrame: -1 },
      { ...move, startFrame: 1.5 },
      { ...move, startFrame: "10" },
      { ...move, track: "Bad Track" },
      { op: "set-prompt", text: "x".repeat(12001) },
      { op: "set-camera", shotId: "hero", camera: { zoom: "in" } },
      { op: "set-camera", shotId: "hero", camera: { movements: "warp" } },
      { op: "set-template-inputs", inputs: { aspect: "9:16" } },
      { op: "set-template-inputs", inputs: { bpm: 90 } },
      { op: "set-template-inputs", inputs: {} },
      {
        op: "add-clip",
        layerId: "x",
        assetId: "video",
        track: "new",
        startFrame: 0,
        durationFrames: 0,
      },
    ])
      expect(() => parseCommand(bad)).toThrow();
  });

  it("strips control characters from names and the prompt, keeping line breaks", () => {
    expect(
      parseCommand({ op: "set-prompt", text: "one\ntwo\x07three" }),
    ).toEqual({ op: "set-prompt", text: "one\ntwo three" });
    expect(
      parseCommand({
        op: "add-clip",
        layerId: "extra",
        assetId: "image-1",
        track: "new",
        startFrame: 0,
        durationFrames: 10,
        name: "  Shot\x00 one ",
      }),
    ).toMatchObject({ name: "Shot  one" });
  });
});

describe("applying Director commands", () => {
  it("adds a clip to an existing track or a new one, without overlaps", () => {
    const copy = copyOf(studio());
    const onTrack = ok(copy, {
      op: "add-clip",
      layerId: "photo-3",
      assetId: "image-1",
      track: "photo-1",
      startFrame: 0,
      durationFrames: 30,
    }).project;
    const added = onTrack.layers.find((l) => l.id === "photo-3")!;
    expect(added).toMatchObject({ kind: "image", track: "photo-1" });
    // It sits beside its lane in stacking order.
    const ids = onTrack.layers.map((l) => l.id);
    expect(ids.indexOf("photo-3")).toBe(ids.indexOf("photo-1") + 1);
    expect(
      refused(copy, {
        op: "add-clip",
        layerId: "photo-3",
        assetId: "image-1",
        track: "photo-1",
        startFrame: 50,
        durationFrames: 30,
      }),
    ).toMatch(/overlaps/);
    const fresh = ok(copy, {
      op: "add-clip",
      layerId: "voice",
      assetId: "audio",
      track: "new",
      startFrame: 30,
      durationFrames: 60,
      name: "Voice",
    }).project;
    expect(fresh.layers.find((l) => l.id === "voice")).toMatchObject({
      kind: "audio",
      sourceStartFrame: 0,
      gain: 1,
      name: "Voice",
    });
  });

  it("refuses ids the project does not hold, taken ids and the wrong track family", () => {
    const copy = copyOf(studio());
    const add = {
      op: "add-clip",
      layerId: "extra",
      assetId: "image-1",
      track: "new",
      startFrame: 0,
      durationFrames: 30,
    };
    expect(refused(copy, { ...add, assetId: "missing" })).toMatch(/No asset/);
    expect(refused(copy, { ...add, assetId: "moodboard" })).toMatch(
      /reference/,
    );
    expect(refused(copy, { ...add, layerId: "plate" })).toMatch(/taken/);
    expect(refused(copy, { ...add, track: "score" })).toMatch(/holds audio/);
    expect(refused(copy, { ...add, track: "nowhere" })).toMatch(/No track/);
    expect(refused(copy, { ...add, startFrame: 170 })).toMatch(/end after/);
  });

  it("adds a graphic with the settings of a layer that uses its recipe", () => {
    const project = ok(copyOf(studio()), {
      op: "add-graphic",
      layerId: "rings-2",
      moduleId: "rings",
      track: "new",
      startFrame: 60,
      durationFrames: 60,
    }).project;
    const pulse = project.layers.find((l) => l.id === "pulse")!;
    const rings = project.layers.find((l) => l.id === "rings-2")!;
    expect(rings).toMatchObject({ kind: "graphics", moduleId: "rings" });
    expect("parameters" in rings && rings.parameters).toEqual(
      "parameters" in pulse && pulse.parameters,
    );
    // New graphics sit under the filters.
    const kinds = project.layers.map((l) => l.kind);
    expect(kinds.indexOf("filter")).toBeGreaterThan(
      project.layers.findIndex((l) => l.id === "rings-2"),
    );
    expect(
      refused(copyOf(studio()), {
        op: "add-graphic",
        layerId: "x",
        moduleId: "caption",
        track: "new",
        startFrame: 0,
        durationFrames: 10,
      }),
    ).toMatch(/No layer uses caption/);
  });

  it("moves and trims a clip, keeping the source in step and refusing a locked one", () => {
    const copy = copyOf(studio());
    const moved = ok(copy, {
      op: "move-clip",
      layerId: "photo-1",
      startFrame: 0,
    });
    expect(moved.project.layers.find((l) => l.id === "photo-1")).toMatchObject({
      startFrame: 0,
      durationFrames: 30,
    });
    const trimmed = ok(copy, {
      op: "trim-clip",
      layerId: "plate",
      startFrame: 30,
      durationFrames: 90,
    }).project.layers.find((l) => l.id === "plate");
    expect(trimmed).toMatchObject({ startFrame: 30, sourceStartFrame: 30 });
    // A left trim cannot reach before the source's first frame.
    const later = ok(
      ok(copy, {
        op: "trim-clip",
        layerId: "plate",
        startFrame: 30,
        durationFrames: 60,
      }),
      { op: "move-clip", layerId: "plate", startFrame: 60 },
    );
    expect(
      refused(later, {
        op: "trim-clip",
        layerId: "plate",
        startFrame: 20,
        durationFrames: 100,
      }),
    ).toMatch(/no earlier source/);
    expect(
      refused(copy, { op: "move-clip", layerId: "labels", startFrame: 0 }),
    ).toMatch(/Unlock/);
    expect(
      refused(copy, { op: "move-clip", layerId: "plate", startFrame: 10 }),
    ).toMatch(/end after/);
    // A clip moves to another lane of its family.
    const lane = ok(copy, {
      op: "move-clip",
      layerId: "photo-2",
      startFrame: 0,
      track: "photo-1",
    }).project.layers.find((l) => l.id === "photo-2");
    expect(lane).toMatchObject({ track: "photo-1", startFrame: 0 });
    expect(
      refused(copy, {
        op: "move-clip",
        layerId: "photo-2",
        startFrame: 0,
        track: "score",
      }),
    ).toMatch(/holds audio/);
  });

  it("sets the project prompt without touching the manifest", () => {
    const copy = copyOf(studio(), "old");
    const next = ok(copy, { op: "set-prompt", text: "A new brief" });
    expect(next.prompt).toBe("A new brief");
    expect(next.project.layers).toEqual(copy.project.layers);
  });

  it("replaces a plate with a clip or a still by asset id, keeping its place", () => {
    const copy = copyOf(studio());
    const photo = ok(copy, {
      op: "replace-plate",
      layerId: "photo-1",
      assetId: "video",
    }).project.layers.find((l) => l.id === "photo-1");
    expect(photo).toMatchObject({
      kind: "video",
      assetId: "video",
      sourceStartFrame: 0,
      startFrame: 60,
      durationFrames: 30,
    });
    // A reference still gets a production alias with a fixed id.
    const aliased = ok(copy, {
      op: "replace-plate",
      layerId: "photo-1",
      assetId: "moodboard",
    }).project;
    expect(aliased.layers.find((l) => l.id === "photo-1")).toMatchObject({
      kind: "image",
      assetId: "moodboard-plate",
    });
    expect(aliased.assets["moodboard-plate"].use).toBe("production");
    expect(
      refused(copy, {
        op: "replace-plate",
        layerId: "score",
        assetId: "video",
      }),
    ).toMatch(/not a picture/);
    expect(
      refused(copy, {
        op: "replace-plate",
        layerId: "photo-1",
        assetId: "audio",
      }),
    ).toMatch(/image or a video/);
  });

  it("gives the same result for the same copy and command", () => {
    const command = {
      op: "add-clip",
      layerId: "again",
      assetId: "image-2",
      track: "new",
      startFrame: 0,
      durationFrames: 15,
    };
    expect(applyCommand(copyOf(studio()), command)).toEqual(
      applyCommand(copyOf(studio()), command),
    );
  });
});

describe("template commands", () => {
  const [product] = houseTemplates;
  const built = async () =>
    copyOf(
      (await buildTemplateBundle(base(), product, {}, samples(product)))
        .project,
    );

  it("sets a shot's camera in the model's wording and keeps it through new inputs", async () => {
    const copy = await built();
    const before = copy.project.generationPlans.find(
      (g) => g.id === "plan-hero",
    )!;
    const camera = { "shot-sizes": "wide", angles: null, movements: "orbit" };
    const next = ok(copy, { op: "set-camera", shotId: "hero", camera });
    const plan = next.project.generationPlans.find(
      (g) => g.id === "plan-hero",
    )!;
    expect(plan.camera).toEqual(camera);
    expect(plan.prompt).not.toBe(before.prompt);
    const titled = ok(next, {
      op: "set-template-inputs",
      inputs: { subject: "a brass desk lamp", title: "LUMEN" },
    }).project;
    const hero = titled.generationPlans.find((g) => g.id === "plan-hero")!;
    expect(hero.camera).toEqual(camera);
    expect(hero.prompt).toContain("brass desk lamp stands alone");
    expect(titled.template?.inputs).toMatchObject({
      subject: "a brass desk lamp",
      title: "LUMEN",
    });
    const type = titled.layers.find((l) => l.id === "title")!;
    expect("parameters" in type && type.parameters.text).toBe("LUMEN");
  });

  it("refuses a move the shot's model does not document, an unknown shot and a non-template project", async () => {
    const copy = await built();
    const model = planTemplate(product).shots[0].input.model;
    const movements = cameraSections.find((s) => s.id === "movements")!;
    const missing = movements.terms.find(
      (t) => !termsFor(movements, model).some((x) => x.id === t.id),
    );
    expect(missing).toBeDefined();
    expect(
      refused(copy, {
        op: "set-camera",
        shotId: "hero",
        camera: { movements: missing!.id },
      }),
    ).toMatch(/has no/);
    expect(
      refused(copy, { op: "set-camera", shotId: "nope", camera: {} }),
    ).toMatch(/No shot nope/);
    expect(
      refused(copyOf(studio()), {
        op: "set-template-inputs",
        inputs: { title: "X" },
      }),
    ).toMatch(/not built from a house template/);
    expect(
      refused(copy, {
        op: "set-template-inputs",
        inputs: { title: "x".repeat(41) },
      }),
    ).toMatch(/1 to 40/);
  });
});
