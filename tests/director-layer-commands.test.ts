import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyCommand,
  parseCommand,
  type DirectorCopy,
} from "../shared/director/commands";
import {
  LAYER_LIMIT,
  type Layer,
  type Project,
} from "../shared/director/types";
import { validateProject } from "../src/director/validate";

// The commands that set how a clip looks and where its source starts:
// set-placement, set-parameters and the in-point on add-clip.
const studio = (): Project =>
  JSON.parse(
    readFileSync("docs/director-bundle/example/studio.json", "utf8"),
  ) as Project;
const copy = (): DirectorCopy => ({ project: studio(), prompt: "" });
function ok(from: DirectorCopy, command: unknown) {
  const result = applyCommand(from, command);
  if (!result.ok) throw new Error(result.error);
  validateProject(result.copy.project);
  expect(result.copy.project.revision).toBe(from.project.revision + 1);
  return result.copy;
}
function refused(from: DirectorCopy, command: unknown) {
  const result = applyCommand(from, command);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}
const layer = (c: DirectorCopy, id: string) =>
  c.project.layers.find((l) => l.id === id) as Layer & Record<string, unknown>;
const params = (c: DirectorCopy, id: string) =>
  (layer(c, id) as unknown as { parameters: Record<string, unknown> })
    .parameters;

describe("parsing placement, parameters and the in-point", () => {
  it("keeps a bounded placement and refuses anything else", () => {
    const punch = {
      op: "set-placement",
      layerId: "plate",
      scale: 1,
      motion: { scaleTo: 1.3, xTo: 40, yTo: -20 },
    };
    expect(parseCommand(punch)).toEqual(punch);
    expect(
      parseCommand({ op: "set-placement", layerId: "plate", motion: null }),
    ).toEqual({ op: "set-placement", layerId: "plate", motion: null });
    for (const bad of [
      { op: "set-placement", layerId: "plate" },
      { op: "set-placement", layerId: "plate", scale: 0 },
      { op: "set-placement", layerId: "plate", scale: 11 },
      { op: "set-placement", layerId: "plate", scale: "2" },
      { op: "set-placement", layerId: "plate", scale: Number.NaN },
      { op: "set-placement", layerId: "plate", opacity: 1.5 },
      { op: "set-placement", layerId: "plate", rotationDegrees: 400 },
      { op: "set-placement", layerId: "plate", position: { z: 1 } },
      { op: "set-placement", layerId: "plate", position: {} },
      { op: "set-placement", layerId: "plate", position: { x: 1e9 } },
      { op: "set-placement", layerId: "plate", motion: { spin: 1 } },
      { op: "set-placement", layerId: "plate", motion: [] },
      { op: "set-placement", layerId: "plate", scale: 1, extra: 1 },
      { op: "set-placement", layerId: "../plate", scale: 1 },
    ])
      expect(() => parseCommand(bad), JSON.stringify(bad)).toThrow();
  });

  it("keeps parameters as text, numbers or switches, cleaned and bounded", () => {
    expect(
      parseCommand({
        op: "set-parameters",
        layerId: "title",
        parameters: { text: " MORPHING\x07TWINS ", size: 64 },
      }),
    ).toEqual({
      op: "set-parameters",
      layerId: "title",
      parameters: { text: "MORPHING TWINS", size: 64 },
    });
    const set = (parameters: unknown) => ({
      op: "set-parameters",
      layerId: "title",
      parameters,
    });
    for (const bad of [
      set({}),
      set([]),
      set("text"),
      set({ text: "x".repeat(201) }),
      set({ text: { nested: true } }),
      set({ text: null }),
      set({ size: Number.POSITIVE_INFINITY }),
      set({ "bad key": 1 }),
      set(Object.fromEntries([...Array(33)].map((_, i) => [`p${i}`, 1]))),
      { op: "set-parameters", layerId: "title" },
    ])
      expect(() => parseCommand(bad), JSON.stringify(bad)).toThrow();
  });

  it("takes an in-point on add-clip in whole source frames", () => {
    const clip = {
      op: "add-clip",
      layerId: "shot",
      assetId: "video",
      track: "new",
      startFrame: 0,
      durationFrames: 30,
    };
    expect(parseCommand({ ...clip, sourceStartFrame: 12 })).toEqual({
      ...clip,
      sourceStartFrame: 12,
    });
    for (const n of [-1, 1.5, "12", 2_000_000])
      expect(() => parseCommand({ ...clip, sourceStartFrame: n })).toThrow();
  });
});

describe("set-placement", () => {
  it("sets a punch-in: a start placement and the end it moves to", () => {
    const next = ok(copy(), {
      op: "set-placement",
      layerId: "plate",
      scale: 1.1,
      motion: { scaleTo: 1.3, xTo: 40, yTo: -20 },
    });
    expect(layer(next, "plate")).toMatchObject({
      scale: 1.1,
      position: { x: 0, y: 0 },
      opacity: 1,
      motion: { scaleTo: 1.3, xTo: 40, yTo: -20, opacityTo: 1 },
    });
    // A later partial change keeps the rest of the start and the end.
    const moved = ok(next, {
      op: "set-placement",
      layerId: "plate",
      position: { y: 40 },
      motion: { opacityTo: 0.5 },
    });
    expect(layer(moved, "plate")).toMatchObject({
      scale: 1.1,
      position: { x: 0, y: 40 },
      motion: { scaleTo: 1.3, xTo: 40, yTo: -20, opacityTo: 0.5 },
    });
    // Everything else stays as it was.
    expect(moved.project.layers.filter((l) => l.id !== "plate")).toEqual(
      studio().layers.filter((l) => l.id !== "plate"),
    );
  });

  it("stops a clip animating with motion null", () => {
    const next = ok(copy(), {
      op: "set-placement",
      layerId: "photo-1",
      motion: null,
    });
    expect("motion" in layer(next, "photo-1")).toBe(false);
  });

  it("refuses audio, filters, locked and unknown layers", () => {
    const place = (layerId: string) => ({
      op: "set-placement",
      layerId,
      scale: 2,
    });
    expect(refused(copy(), place("score"))).toMatch(/no placement/);
    expect(refused(copy(), place("finish"))).toMatch(/no placement/);
    expect(refused(copy(), place("labels"))).toMatch(/Unlock/);
    expect(refused(copy(), place("nope"))).toMatch(/No layer nope/);
  });
});

describe("set-parameters", () => {
  it("sets a title's text and size, keeping its other parameters", () => {
    const next = ok(copy(), {
      op: "set-parameters",
      layerId: "title",
      parameters: { text: "MORPHING TWINS", size: 64 },
    });
    expect(params(next, "title")).toEqual({
      text: "MORPHING TWINS",
      color: "#e4e8ed",
      size: 64,
      bpm: 120,
    });
    // A filter's controls too.
    const dither = ok(copy(), {
      op: "set-parameters",
      layerId: "finish",
      parameters: { levels: 8 },
    });
    expect(params(dither, "finish")).toEqual({
      amount: 0.6,
      levels: 8,
    });
  });

  it("refuses an unknown parameter, a wrong type, too long, out of range or off pattern", () => {
    const set = (layerId: string, parameters: Record<string, unknown>) => ({
      op: "set-parameters",
      layerId,
      parameters,
    });
    expect(refused(copy(), set("title", { font: "W9" }))).toMatch(
      /title has no parameter font; it takes text, color, size, bpm/,
    );
    expect(refused(copy(), set("title", { size: "big" }))).toMatch(
      /size must be a number/,
    );
    expect(refused(copy(), set("title", { text: 42 }))).toMatch(
      /text must be text/,
    );
    expect(refused(copy(), set("title", { text: "x".repeat(81) }))).toMatch(
      /at most 80 characters/,
    );
    expect(refused(copy(), set("title", { size: 200 }))).toMatch(
      /from 8 to 96/,
    );
    expect(refused(copy(), set("title", { color: "red" }))).toMatch(
      /color does not match/,
    );
    expect(refused(copy(), set("pulse", { count: 2.5 }))).toMatch(
      /whole number/,
    );
    expect(refused(copy(), set("plate", { text: "x" }))).toMatch(
      /no recipe parameters/,
    );
    expect(refused(copy(), set("labels", { length: 20 }))).toMatch(/Unlock/);
  });

  it("gives a copied title its own words", () => {
    const added = ok(copy(), {
      op: "add-graphic",
      layerId: "title-2",
      moduleId: "title",
      track: "new",
      startFrame: 30,
      durationFrames: 60,
      name: "MORPHING TWINS",
    });
    const next = ok(added, {
      op: "set-parameters",
      layerId: "title-2",
      parameters: { text: "MORPHING TWINS" },
    });
    expect(params(next, "title-2").text).toBe("MORPHING TWINS");
    expect(params(next, "title").text).toBe("SIGNAL STUDIES");
  });
});

describe("the in-point on add-clip", () => {
  const clip = (extra: Record<string, unknown>) => ({
    op: "add-clip",
    layerId: "shot",
    track: "new",
    startFrame: 0,
    durationFrames: 60,
    ...extra,
  });

  it("places a video or audio clip from its in-point in one command", () => {
    const video = ok(copy(), clip({ assetId: "video", sourceStartFrame: 30 }));
    expect(layer(video, "shot")).toMatchObject({
      kind: "video",
      sourceStartFrame: 30,
    });
    const audio = ok(copy(), clip({ assetId: "audio", sourceStartFrame: 90 }));
    expect(layer(audio, "shot")).toMatchObject({
      kind: "audio",
      sourceStartFrame: 90,
    });
    // Without one, the clip starts at its first frame, as before.
    expect(layer(ok(copy(), clip({ assetId: "video" })), "shot")).toMatchObject(
      { sourceStartFrame: 0 },
    );
  });

  it("refuses an in-point past the source or on a still", () => {
    // 6 s at 30 fps: frames 150 to 210 are not there.
    expect(
      refused(copy(), clip({ assetId: "video", sourceStartFrame: 150 })),
    ).toMatch(/Source too short/);
    expect(
      refused(copy(), clip({ assetId: "image-1", sourceStartFrame: 0 })),
    ).toMatch(/still image/);
  });
});

describe("the layer cap", () => {
  // A dense cut: sequential video clips on one track, up to the cap.
  const cut = (n: number): DirectorCopy => {
    const p = studio();
    const plate = p.layers.find((l) => l.id === "plate")!;
    p.composition.durationFrames = n * 3;
    p.layers = [...Array(n)].map(
      (_, i) =>
        ({
          ...plate,
          id: `shot-${i}`,
          name: `Shot ${i}`,
          startFrame: i * 3,
          durationFrames: 3,
          track: "cut",
        }) as Layer,
    );
    return { project: p, prompt: "" };
  };

  it("holds 128 layers, the same limit for import and commands", () => {
    expect(LAYER_LIMIT).toBe(128);
    expect(() => validateProject(cut(LAYER_LIMIT).project)).not.toThrow();
    expect(() => validateProject(cut(LAYER_LIMIT + 1).project)).toThrow(
      /128 layers/,
    );
    const almost = cut(LAYER_LIMIT - 1);
    almost.project.composition.durationFrames += 3;
    const clip = {
      op: "add-clip",
      layerId: "last",
      assetId: "video",
      track: "new",
      startFrame: 0,
      durationFrames: 3,
    };
    const full = ok(almost, clip);
    expect(full.project.layers).toHaveLength(LAYER_LIMIT);
    expect(refused(full, { ...clip, layerId: "over" })).toMatch(
      /at most 128 layers/,
    );
  });
});
