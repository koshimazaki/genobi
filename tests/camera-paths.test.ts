import { describe, expect, it } from "vitest";
import {
  cameraSections,
  emptyCamera,
  type CameraSelection,
} from "../shared/camera";
import { cameraPath, cameraPose } from "../src/scene/camera-paths";
const selection = (patch: Partial<CameraSelection>): CameraSelection => ({
  ...emptyCamera,
  ...patch,
});
describe("composed camera paths", () => {
  it("keeps every supported combination finite and above ground", () => {
    for (const shot of [null, ...cameraSections[0].terms.map((t) => t.id)])
      for (const angle of [null, ...cameraSections[1].terms.map((t) => t.id)])
        for (const movement of [
          null,
          ...cameraSections[2].terms.map((t) => t.id),
        ])
          for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
            const pose = cameraPose(
              { "shot-sizes": shot, angles: angle, movements: movement },
              progress,
            );
            expect(
              [
                ...pose.position,
                ...pose.target,
                pose.roll,
                pose.subjectRotation,
              ].every(Number.isFinite),
            ).toBe(true);
            expect(pose.position[1]).toBeGreaterThan(0);
            expect(
              Math.hypot(...pose.position.map((v, i) => v - pose.target[i])),
            ).toBeGreaterThan(0.1);
          }
  });
  it("combines framing distance, angle and a complete orbit without drift", () => {
    const camera = selection({
      "shot-sizes": "wide",
      angles: "high-angle",
      movements: "orbit",
    });
    const start = cameraPose(camera, 0);
    cameraPose(camera, 1).position.forEach((v, i) =>
      expect(v).toBeCloseTo(start.position[i]),
    );
    expect(cameraPose(camera, 0.5).position[2]).toBeLessThan(0);
    expect(start.position[1]).toBeGreaterThan(start.target[1]);
    expect(
      Math.hypot(...start.position.map((v, i) => v - start.target[i])),
    ).toBeCloseTo(3.8);
  });
  it("distinguishes a rotating subject from an orbit and a pan from trucking", () => {
    const lazy = selection({ movements: "lazy-susan" });
    expect(cameraPose(lazy, 0).position).toEqual(
      cameraPose(lazy, 0.5).position,
    );
    expect(cameraPose(lazy, 0.5).subjectRotation).toBeCloseTo(Math.PI);
    const pan = selection({ movements: "pan" });
    expect(cameraPose(pan, 0).position).toEqual(cameraPose(pan, 1).position);
    expect(cameraPose(pan, 0).target).not.toEqual(cameraPose(pan, 1).target);
    const truck = selection({ movements: "trucking" });
    expect(cameraPose(truck, 0).position).not.toEqual(
      cameraPose(truck, 1).position,
    );
    expect(cameraPose(truck, 0).target).toEqual(cameraPose(truck, 1).target);
  });
  it("dollies inward, cranes upward, and tilts without translating", () => {
    const dolly = selection({ movements: "dolly-in" });
    expect(cameraPose(dolly, 1).position[2]).toBeLessThan(
      cameraPose(dolly, 0).position[2],
    );
    const crane = selection({ movements: "crane" });
    expect(cameraPose(crane, 1).position[1]).toBeGreaterThan(
      cameraPose(crane, 0).position[1],
    );
    const tilt = selection({ movements: "tilt" });
    expect(cameraPose(tilt, 1).target[1]).toBeGreaterThan(
      cameraPose(tilt, 0).target[1],
    );
    expect(cameraPose(tilt, 0).position).toEqual(cameraPose(tilt, 1).position);
  });
  it("distinguishes overhead, ground level, Dutch and profile angles", () => {
    expect(
      cameraPose(selection({ angles: "birds-eye" }), 1).position[2],
    ).toBeLessThan(0.1);
    expect(
      cameraPose(selection({ angles: "worms-eye" }), 1).position[1],
    ).toBeCloseTo(0.12);
    expect(cameraPose(selection({ angles: "dutch" }), 1).roll).not.toBe(0);
    expect(
      cameraPose(selection({ angles: "profile" }), 1).position[0],
    ).toBeGreaterThan(2);
  });
  it("clamps progress and bounds path samples", () => {
    const camera = selection({ movements: "arc" });
    expect(cameraPose(camera, -2)).toEqual(cameraPose(camera, 0));
    expect(cameraPose(camera, 2)).toEqual(cameraPose(camera, 1));
    expect(cameraPose(camera, NaN)).toEqual(cameraPose(camera, 0));
    expect(cameraPath(camera, 0)).toHaveLength(2);
    expect(cameraPath(camera, Infinity)).toHaveLength(49);
  });
});

describe("model-only moves still move the preview", () => {
  it.each(["pull-back", "dolly-left", "dolly-right", "jib-down"] as const)(
    "%s (LTX only) moves the camera",
    (movement) => {
      const camera = selection({ movements: movement });
      expect(cameraPose(camera, 1).position).not.toEqual(
        cameraPose(selection({}), 1).position,
      );
      expect(cameraPose(camera, 0)).not.toEqual(cameraPose(camera, 1));
    },
  );
  it("a FLUX-only move (arc) moves the camera too", () => {
    const camera = selection({ movements: "arc" });
    expect(cameraPose(camera, 0)).not.toEqual(cameraPose(camera, 1));
  });
});
