import { describe, expect, it } from "vitest";
import {
  frameIndex,
  clampFrame,
  rulerWindow,
  frameFilename,
  pixelLevels,
  timeLabel,
} from "../src/dual-editor/frame-math";

describe("Dual Editor frame identity", () => {
  it("sorts B-frame decode order by presentation time, preserving variable durations", () => {
    const points = frameIndex([
      { timestamp: 0, duration: 0.04 },
      { timestamp: 0.14, duration: 0.1 },
      { timestamp: 0.04, duration: 0.02 },
      { timestamp: 0.06, duration: 0.08 },
    ]);
    expect(points.map((p) => p.timestamp)).toEqual([0, 0.04, 0.06, 0.14]);
    expect(points.map((p) => p.duration)).toEqual([0.04, 0.02, 0.08, 0.1]);
  });
  it("refuses timestamps that cannot identify individual decoded frames", () => {
    expect(() => frameIndex([])).toThrow();
    expect(() =>
      frameIndex([
        { timestamp: 0, duration: 0.04 },
        { timestamp: 0.0000001, duration: 0.04 },
      ]),
    ).toThrow(/ambiguous/);
    expect(() => frameIndex([{ timestamp: NaN, duration: 0.04 }])).toThrow(
      /invalid/,
    );
  });
  it("keeps short clips and end-of-clip zoom windows within their real frame counts", () => {
    expect(rulerWindow(239, 240, 24)).toEqual([215, 239]);
    expect(rulerWindow(0, 5, 24)).toEqual([0, 4]);
    expect(rulerWindow(0, 1, 24)).toEqual([0, 0]);
    expect(clampFrame(240, 240)).toBe(239);
    expect(clampFrame(-1, 240)).toBe(0);
  });
  it("does not fabricate a frame-rate timecode, and gives exports safe indexed names", () => {
    expect(timeLabel(60.123)).toBe("01:00.123");
    expect(frameFilename("../scene:take?.mp4", 17)).toBe(
      "..-scene-take-_frame-000017.png",
    );
  });
  it("measures black, white and luma consistently", () => {
    const result = pixelLevels(
      new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
    );
    expect(result.luma).toBeCloseTo(50);
    expect(result.black).toBe(50);
    expect(result.white).toBe(50);
    expect(result.histogram[0]).toBe(1);
    expect(result.histogram[63]).toBe(1);
  });
});
