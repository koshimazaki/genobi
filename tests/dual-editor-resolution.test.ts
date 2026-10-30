import { describe, it, expect } from "vitest";
import {
  exportResolution,
  framePlacement,
} from "../src/dual-editor/export-resolution";
const sources = new Map([
  ["small", { name: "small.mp4", width: 640, height: 360 }],
  ["native", { name: "generation.mp4", width: 2176, height: 928 }],
  ["4k", { name: "4k.mp4", width: 3840, height: 2160 }],
  ["portrait", { name: "portrait.mp4", width: 1080, height: 1920 }],
]);
describe("Native timeline export sizing", () => {
  it("preserves the actual 2176 × 928 generation and 4K without a 1080p cap", () => {
    expect(exportResolution([{ source: "native" }], sources)).toMatchObject({
      width: 2176,
      height: 928,
      mixed: false,
    });
    expect(exportResolution([{ source: "4k" }], sources)).toMatchObject({
      width: 3840,
      height: 2160,
      mixed: false,
    });
  });
  it("mixed native size keeps each pixel and pads smaller clips regardless of source order", () => {
    const info = exportResolution(
      [{ source: "small" }, { source: "4k" }],
      sources,
    )!;
    expect(info).toMatchObject({ width: 3840, height: 2160, mixed: true });
    expect(info.used[0]).toMatchObject({
      fit: 1,
      bars: true,
      operation: "Native size",
    });
    expect(info.used[1]).toMatchObject({ fit: 1, bars: false });
    expect(
      exportResolution([{ source: "4k" }, { source: "small" }], sources),
    ).toMatchObject({ width: 3840, height: 2160 });
  });
  it("mixed scale-to-fit enlarges without changing aspect ratio", () => {
    const info = exportResolution(
      [{ source: "small" }, { source: "4k" }, { source: "portrait" }],
      sources,
      "fit",
    )!;
    expect(info.used[0]).toMatchObject({
      fit: 6,
      bars: false,
      operation: "Scaled to fit",
    });
    expect(info.used[2]).toMatchObject({ fit: 1.125, bars: true });
  });
  it("contains different aspects without cropping, rounding odd dimensions UP", () => {
    const map = new Map([
      ...sources,
      ["odd", { name: "odd", width: 641, height: 361 }],
    ]);
    expect(exportResolution([{ source: "odd" }], map)).toMatchObject({
      width: 642,
      height: 362,
      mixed: false,
    });
    expect(exportResolution([{ source: "odd" }], map)!.used[0]).toMatchObject({
      fit: 1,
      bars: true,
    });
    expect(
      exportResolution([{ source: "native" }, { source: "portrait" }], sources),
    ).toMatchObject({ width: 2176, height: 1920 });
  });
  it("uses native cadence for re-encode instead of forcing every clip to 30 fps", () => {
    const map = new Map([
      [
        "a",
        {
          name: "24fps",
          width: 640,
          height: 360,
          frames: [
            { timestamp: 0, duration: 1 / 24 },
            { timestamp: 1 / 24, duration: 1 / 24 },
          ],
        },
      ],
      [
        "b",
        {
          name: "60fps",
          width: 640,
          height: 360,
          frames: [
            { timestamp: 0, duration: 1 / 60 },
            { timestamp: 1 / 60, duration: 1 / 60 },
          ],
        },
      ],
    ]);
    expect(exportResolution([{ source: "a" }], map)!.frameRate).toBe(24);
    expect(
      exportResolution([{ source: "a" }, { source: "b" }], map)!.frameRate,
    ).toBe(60);
  });
  it("pads odd sizes on integer pixels, avoiding interpolation in native mode", () => {
    expect(framePlacement(641, 361, 642, 362, "native")).toEqual({
      x: 0,
      y: 0,
      width: 641,
      height: 361,
    });
    expect(framePlacement(320, 180, 2176, 928, "native")).toEqual({
      x: 928,
      y: 374,
      width: 320,
      height: 180,
    });
  });
  it("ignores unused and duplicate sources and handles an empty edit", () => {
    expect(
      exportResolution([{ source: "small" }, { source: "small" }], sources)!
        .used,
    ).toHaveLength(1);
    expect(exportResolution([], sources)).toBeNull();
  });
});
