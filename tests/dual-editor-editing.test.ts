import { dragClip } from "../src/dual-editor/clip-drag";
import { describe, expect, it } from "vitest";
import {
  activeClip,
  boundary,
  clipDuration,
  duration,
  programSegments,
  sourceFrame,
  splitClip,
  validateEdit,
  type EditClip,
} from "../src/dual-editor/timeline-model";
import { adjustPixels, neutral } from "../src/dual-editor/frame-adjustments";
import { curveLut, identityCurves } from "../src/dual-editor/color-curves";
const source = {
  frames: [
    { timestamp: 2, duration: 0.1 },
    { timestamp: 2.1, duration: 0.2 },
    { timestamp: 2.3, duration: 0.1 },
    { timestamp: 2.4, duration: 0.3 },
  ],
};
const sources = new Map([["s", source]]);
const clip: EditClip = {
  id: "a",
  source: "s",
  lane: "A",
  start: 0,
  in: 0,
  out: 4,
  muted: false,
};
describe("Dual Editor cut identity", () => {
  it("splits at a real VFR boundary without losing or duplicating a source frame", () => {
    const parts = splitClip(clip, source, 0.25, "b");
    expect(parts.map((c) => [c.in, c.out])).toEqual([
      [0, 1],
      [1, 4],
    ]);
    expect(parts[1].start).toBeCloseTo(0.1);
    expect(parts.reduce((n, c) => n + clipDuration(c, source), 0)).toBeCloseTo(
      clipDuration(clip, source),
    );
    expect(sourceFrame(source, 2.299)).toBe(1);
    expect(() => splitClip(clip, source, 0, "b")).toThrow();
  });
  it("preserves the final frame's actual duration and non-zero PTS origin", () => {
    expect(boundary(source, 4)).toBeCloseTo(2.7);
    expect(duration([clip], sources)).toBeCloseTo(0.7);
  });
  it("uses upper A's picture AND audio only during the overlap, with exclusive out boundaries", () => {
    const b: EditClip = {
      ...clip,
      id: "b",
      lane: "A",
      start: 0.1,
      in: 1,
      out: 2,
    };
    const lower = { ...clip, lane: "B" as const };
    expect(activeClip([lower, b], sources, 0.15)?.id).toBe("b");
    expect(activeClip([lower, b], sources, 0.31)?.id).toBe("a");
    expect(activeClip([clip], sources, 0.7)).toBeUndefined();
    expect(programSegments([lower, b], sources).map((s) => s.clip?.id)).toEqual(
      ["a", "b", "a"],
    );
  });
  it("keeps intentional empty time as an explicit black/silent segment", () => {
    expect(programSegments([{ ...clip, start: 1 }], sources)[0]).toMatchObject({
      start: 0,
      end: 1,
      clip: undefined,
    });
  });
  it("rejects same-track overlaps and malformed or excessive edits", () => {
    for (const clips of [
      [clip, { ...clip, id: "b", start: 0.1 }],
      [{ ...clip, in: 2, out: 2 }],
      [{ ...clip, start: NaN }],
      [{ ...clip, start: 120 }],
      [{ ...clip, out: 99 }],
      [{ ...clip, source: "gone" }],
    ])
      expect(() => validateEdit(clips, sources)).toThrow();
    expect(() =>
      validateEdit([clip, { ...clip, id: "b", lane: "B" }], sources),
    ).not.toThrow();
  });
});
describe("Dual Editor pixel grading", () => {
  it("leaves neutral RGBA pixels byte-identical and preserves alpha under all controls", () => {
    const pixels = new Uint8ClampedArray([17, 81, 230, 43, 0, 128, 255, 0]),
      original = pixels.slice();
    adjustPixels(pixels, neutral);
    expect(pixels).toEqual(original);
    adjustPixels(pixels, {
      ...neutral,
      exposure: 1,
      saturation: 25,
      hue: 45,
      contrast: 20,
    });
    expect([pixels[3], pixels[7]]).toEqual([43, 0]);
  });
  it("doubles linear-light intensity by one EV instead of doubling sRGB values", () => {
    const pixels = new Uint8ClampedArray([128, 128, 128, 255]);
    adjustPixels(pixels, { ...neutral, exposure: 1 });
    expect(pixels[0]).toBeGreaterThan(173);
    expect(pixels[0]).toBeLessThan(178);
  });
  it("removes saturation and rotates red to green at 120 degrees", () => {
    const gray = new Uint8ClampedArray([210, 50, 20, 255]),
      red = new Uint8ClampedArray([255, 0, 0, 255]);
    adjustPixels(gray, { ...neutral, saturation: -100 });
    expect(gray[0]).toBe(gray[1]);
    expect(gray[1]).toBe(gray[2]);
    adjustPixels(red, { ...neutral, hue: 120 });
    expect([...red]).toEqual([0, 255, 0, 255]);
  });
  it("interpolates the complete identity curve and applies channel-specific curves to exported pixels", () => {
    expect([...curveLut([64, 128, 192])]).toEqual(
      Array.from({ length: 256 }, (_, i) => i),
    );
    const pixels = new Uint8ClampedArray([128, 128, 128, 123]);
    adjustPixels(pixels, {
      ...neutral,
      curves: { ...identityCurves, red: [64, 180, 220] },
    });
    expect([...pixels]).toEqual([180, 128, 128, 123]);
  });
});

describe("Direct timeline manipulation", () => {
  it("moves a clip between tracks without changing its source range", () => {
    const moved = dragClip({ ...clip, start: 2 }, source, "move", -2, "B");
    expect(moved).toMatchObject({ start: 0, lane: "B", in: 0, out: 4 });
    validateEdit([moved], sources);
  });
  it("trims the start on source frame boundaries while preserving the right edge", () => {
    const trimmed = dragClip(clip, source, "in", 0.28);
    expect(trimmed.in).toBe(2);
    expect(trimmed.start).toBeCloseTo(0.3);
    expect(trimmed.start + clipDuration(trimmed, source)).toBeCloseTo(0.7);
    const extended = dragClip(trimmed, source, "in", -0.3);
    expect(extended.in).toBe(0);
    expect(extended.start).toBe(0);
  });
  it("trims the end with at least one frame and cannot extend past the source", () => {
    expect(dragClip(clip, source, "out", -10).out).toBe(1);
    expect(dragClip(clip, source, "out", 10).out).toBe(4);
  });
});
