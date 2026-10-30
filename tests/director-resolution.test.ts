import { describe, expect, it } from "vitest";
import { applyCommand, parseCommand } from "../shared/director/commands";
import { matchAssetResolution } from "../shared/director/resolution";
import { diffCopies } from "../shared/director/feedback";
import { visualAt, type Project } from "../shared/director/types";
import { createStudioStore } from "../src/studio/store";
import { validateProject } from "../src/director/validate";
import { base } from "./house-template-fixtures";

const size = { width: 1920, height: 1080 };
const command = { op: "set-resolution", ...size };
function resize(project: Project) {
  const result = applyCommand({ project, prompt: "keep" }, command);
  if (!result.ok) throw new Error(result.error);
  validateProject(result.copy.project);
  return result.copy;
}

describe("set-resolution", () => {
  it("scales pixel placement and animated offsets while keeping fitted zoom and timing", () => {
    const project = base().project;
    project.composition.width = 960;
    project.composition.height = 540;
    const l = project.layers.find((l) => "position" in l)!;
    if (!("position" in l)) throw new Error("visual fixture missing");
    l.position = { x: 120, y: -30 };
    l.scale = 1.25;
    l.motion = { xTo: 80, yTo: 50, scaleTo: 1.8, opacityTo: 0.4 };
    l.locked = true;
    const before = structuredClone(project);
    const next = resize(project).project;
    expect(next.composition).toMatchObject(size);
    expect(next.revision).toBe(project.revision + 1);
    const layer = next.layers.find((n) => n.id === l.id)!;
    if (!("position" in layer)) throw new Error("visual fixture missing");
    expect(layer).toEqual({
      ...l,
      position: { x: 240, y: -60 },
      motion: { ...l.motion, xTo: 160, yTo: 100 },
    });
    // Contain fitting doubles the rendered source size; zoom is unchanged.
    for (const frame of [l.startFrame, l.startFrame + l.durationFrames - 1]) {
      const a = visualAt(l, frame),
        b = visualAt(layer, frame);
      expect(b.position.x / 1920).toBeCloseTo(a.position.x / 960);
      expect(b.position.y / 1080).toBeCloseTo(a.position.y / 540);
      expect(b.scale).toBe(a.scale);
    }
    expect(project).toEqual(before);
    expect(next.layers.filter((l) => !("position" in l))).toEqual(
      project.layers.filter((l) => !("position" in l)),
    );
  });

  it.each([
    {},
    { width: "1920", height: 1080 },
    { width: 15, height: 16 },
    { width: 1920.5, height: 1080 },
    { width: 4097, height: 16 },
    { width: 1920, height: 1081 },
    { width: Infinity, height: 16 },
    { ...size, extra: true },
  ])("refuses invalid or oversized dimensions: %j", (fields) => {
    expect(() => parseCommand({ op: "set-resolution", ...fields })).toThrow();
    expect(
      applyCommand(
        { project: base().project, prompt: "" },
        { op: "set-resolution", ...fields },
      ).ok,
    ).toBe(false);
  });

  it("uses the same pixel cap as full bundle validation, accepting portrait 1080p", () => {
    const project = base().project;
    expect(() =>
      validateProject({
        ...project,
        composition: { ...project.composition, ...size },
      }),
    ).not.toThrow();
    expect(() =>
      validateProject({
        ...project,
        composition: { ...project.composition, width: 1920, height: 1081 },
      }),
    ).toThrow(/1080p/);
    expect(() =>
      parseCommand({ op: "set-resolution", width: 1080, height: 1920 }),
    ).not.toThrow();
  });

  it("is one Undo step, restoring placement and keeping revision monotonic", () => {
    const bundle = base();
    const store = createStudioStore();
    store.getState().actions.initialize(bundle);
    store
      .getState()
      .actions.commit(
        { ...bundle, project: resize(bundle.project).project },
        bundle,
      );
    expect(store.getState().director.history).toHaveLength(1);
    store.getState().actions.undo();
    const restored = store.getState().director.bundle!.project;
    expect(restored.composition).toEqual(bundle.project.composition);
    expect(restored.layers).toEqual(bundle.project.layers);
    expect(restored.revision).toBe(bundle.project.revision + 2);
    expect(() => store.getState().actions.commit(bundle, bundle)).toThrow(
      /changed/,
    );
  });

  it("replays resolution feedback without spurious layer placement commands", () => {
    const before = { project: base().project, prompt: "keep" };
    const diff = diffCopies(before, resize(before.project));
    expect(diff.commands.map((c) => c.command)).toEqual([command]);
    expect(diff.unmapped).toEqual([]);
  });
});

it("matches the largest video, preserves ratio, and clamps to the validator cap", () => {
  const composition = { width: 960, height: 540 };
  expect(
    matchAssetResolution(composition, [
      { width: 1280, height: 720 },
      { width: 3840, height: 2160 },
    ]),
  ).toEqual(size);
  expect(
    matchAssetResolution(composition, [{ width: 1280, height: 720 }]),
  ).toEqual({ width: 1280, height: 720 });
  expect(
    matchAssetResolution(composition, [{ width: 1440, height: 1440 }]),
  ).toEqual({ width: 1440, height: 810 });
  expect(matchAssetResolution({ width: 540, height: 960 }, [size])).toEqual({
    width: 594,
    height: 1056,
  });
  expect(() => matchAssetResolution(composition, [])).toThrow(/video asset/);
});

it("draws literal pixel typography at the new native size without rewriting historical recipes", async () => {
  const { recipeResolution } =
    await import("../src/director/recipe-resolution");
  const project = base().project;
  const title = project.layers.find(
    (l) => l.kind === "graphics" && typeof l.parameters.size === "number",
  )!;
  if (!("parameters" in title)) throw new Error("missing type fixture");
  expect(recipeResolution(project, title)).toEqual(title.parameters);
  const next = resize(project).project;
  const multiplier = Math.min(
    1920 / project.composition.width,
    1080 / project.composition.height,
  );
  expect(recipeResolution(next, title).size).toBe(
    (title.parameters.size as number) * multiplier,
  );
  expect(next.layers.find((l) => l.id === title.id)).toEqual(title);
});
