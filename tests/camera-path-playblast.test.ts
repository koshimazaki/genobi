import { describe, expect, it } from "vitest";
import { createScene } from "../shared/scene/commands";
import { validateCameraPath } from "../shared/camera-path";
import {
  PLAYBLAST_FPS,
  PLAYBLAST_SECONDS,
  playblastFrames,
  readPlayblastReceipt,
  validatePlayblastReceipt,
  writePlayblastReceipt,
  type PlayblastReceipt,
} from "../shared/camera-path-playblast";
import { LTX_DURATIONS } from "../shared/comfy/ltx";
import { DEFAULT_RIG } from "../src/scene3d/combo";
import { GESTURE_BY_ID } from "../src/scene3d/gestures";
import { PLATE_BY_ID } from "../src/scene3d/plates";
import { plateCameraPath } from "../src/scene3d/plate-path";
import { SCENE_BY_ID } from "../src/scene3d/scenes";

function receipt(frames = 49): PlayblastReceipt {
  const gestures = [GESTURE_BY_ID["tilt-up"], GESTURE_BY_ID.turntable];
  return {
    format: "genobi.playblast",
    version: 1,
    scene: "set",
    plate: "push-in",
    gestures: gestures.map((g) => g.id),
    ease: "easeInOutCubic",
    fps: PLAYBLAST_FPS,
    frames,
    width: 1280,
    height: 704,
    cameraPath: plateCameraPath(
      PLATE_BY_ID["push-in"],
      SCENE_BY_ID.set,
      { ...DEFAULT_RIG, duration: (frames - 1) / PLAYBLAST_FPS },
      gestures,
      frames,
    ),
  };
}

describe("playblast frame grid", () => {
  it("rounds to 8k+1 frames inside World Builder's 9..241", () => {
    expect(playblastFrames(5)).toBe(121);
    expect(playblastFrames(2)).toBe(49);
    expect(playblastFrames(10)).toBe(241);
    expect(playblastFrames(0)).toBe(9);
    expect(playblastFrames(60)).toBe(241);
    for (let s = 0; s < 12; s += 0.37)
      expect((playblastFrames(s) - 1) % 8).toBe(0);
  });

  it("offers LTX's durations that fit the grid, with 5 s among them", () => {
    expect(PLAYBLAST_SECONDS).toEqual([2, 3, 4, 5, 6, 8, 10]);
    for (const s of PLAYBLAST_SECONDS)
      expect((LTX_DURATIONS as readonly number[]).includes(s)).toBe(true);
  });
});

describe("playblast receipt", () => {
  it("round trips through text with the shared camera path intact", () => {
    const original = receipt();
    const back = readPlayblastReceipt(writePlayblastReceipt(original));
    expect(back).toEqual(original);
    expect(validateCameraPath(back.cameraPath)).toEqual(original.cameraPath);
    expect(back.cameraPath.keys).toHaveLength(49);
  });

  it("keeps a full-length receipt within its bound", () => {
    expect(writePlayblastReceipt(receipt(241)).length).toBeLessThan(96 * 1024);
  });

  it("rejects unknown fields, bad ids, grids and sizes", () => {
    const good = receipt();
    const bad: unknown[] = [
      { ...good, extra: 1 },
      { ...good, plate: "Push In" },
      { ...good, gestures: ["rise", "rise"] },
      { ...good, frames: 50 },
      { ...good, fps: 30 },
      { ...good, width: 1000 },
      { ...good, ease: "bounce" },
      { ...good, format: "other" },
      { ...good, cameraPath: { ...good.cameraPath, duration: 3 } },
      { ...good, cameraPath: { ...good.cameraPath, keys: [] } },
    ];
    for (const value of bad)
      expect(() => validatePlayblastReceipt(value)).toThrow();
    expect(() => readPlayblastReceipt("{")).toThrow(/not JSON/);
    expect(() => readPlayblastReceipt("x".repeat(100 * 1024))).toThrow();
  });
});

it("keeps scene ids within the playblast receipt boundary", () => {
  const scene = createScene("s".repeat(40));
  expect(
    validatePlayblastReceipt({ ...receipt(), scene: scene.id }).scene,
  ).toBe(scene.id);
  expect(() => createScene("s".repeat(41))).toThrow(/id/);
});

it("round-trips optional creature provenance and refuses private or malformed fields", () => {
  const creature = {
    sha256: "a".repeat(64),
    motions: {
      idle: {
        sha256: "b".repeat(64),
        source: "local FBX; rights supplied by operator" as const,
      },
    },
  };
  expect(
    readPlayblastReceipt(writePlayblastReceipt({ ...receipt(), creature }))
      .creature,
  ).toEqual(creature);
  for (const invalid of [
    { ...creature, path: "private" },
    { ...creature, sha256: "no" },
    {
      ...creature,
      motions: { unknown: { sha256: "c".repeat(64), source: "url" } },
    },
  ])
    expect(() =>
      validatePlayblastReceipt({ ...receipt(), creature: invalid }),
    ).toThrow();
});
