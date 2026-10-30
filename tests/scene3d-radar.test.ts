/**
 * The radar's geometry (PR 52 re-review): every plate fits every pane in
 * both views, and the swept wedge keeps its direction across ±180°.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_RIG, sampleRig } from "../src/scene3d/combo";
import { PLATE_BY_ID, PLATES } from "../src/scene3d/plates";
import { plateTrace } from "../src/scene3d/plate-path";
import {
  drawRadar,
  RADAR_MIN_SIZE,
  radarProjector,
  radarRange,
  sweptWedge,
  type Point,
  type RadarInput,
} from "../src/scene3d/radar-drawing";
import { SCENE_BY_ID, SCENES } from "../src/scene3d/scenes";

const rig = { ...DEFAULT_RIG, duration: 5 };
/** Desktop and phone panes, plus extreme shapes either way. */
const PANES = [
  [410, 150],
  [169, 130],
  [300, 150],
  [800, 150],
  [150, 300],
] as const;

describe("radar fits every plate", () => {
  for (const scene of SCENES)
    for (const plate of PLATES)
      it(`${plate.id} on ${scene.id}`, () => {
        const input: RadarInput = {
          trace: plateTrace(plate, scene, rig, []),
          t: 1,
          layers: sampleRig(plate, rig, 1).layers,
        };
        const points = [...input.trace, ...input.layers.map((l) => l.end)];
        for (const view of ["top", "side"] as const)
          for (const [w, h] of PANES) {
            const at = radarProjector(view, w, h, radarRange(input, view));
            for (const p of points.map(at)) {
              // Inside the pane with room for a marker.
              expect(p.x).toBeGreaterThanOrEqual(10);
              expect(p.x).toBeLessThanOrEqual(w - 10);
              expect(p.y).toBeGreaterThanOrEqual(10);
              expect(p.y).toBeLessThanOrEqual(h - 10);
            }
          }
      });

  it("keeps Crane up's high end inside a wide, short pane", () => {
    const plate = PLATE_BY_ID["crane-up"];
    const input: RadarInput = {
      trace: plateTrace(plate, SCENE_BY_ID.set, rig, []),
      t: 1,
      layers: [],
    };
    const at = radarProjector("side", 410, 150, radarRange(input, "side"));
    const end = at(input.trace[input.trace.length - 1]);
    // The END label sits 12 px below the marker and 7 px to its right.
    expect(end.y).toBeGreaterThanOrEqual(18);
    expect(end.y + 12).toBeLessThanOrEqual(150);
  });
});

describe("swept wedge", () => {
  const origin = { x: 0, y: 0 };
  const arc = (from: number, to: number, steps = 10): Point[] =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
      return { x: Math.cos(a) * 50, y: Math.sin(a) * 50 };
    });
  const degrees = (w: { start: number; end: number }) =>
    ((w.end - w.start) * 180) / Math.PI;

  it("keeps a clockwise sweep through 180° clockwise and small", () => {
    const wedge = sweptWedge(arc(170, 190), origin, 10);
    expect(wedge.anticlockwise).toBe(false);
    expect(degrees(wedge)).toBeCloseTo(20, 6);
  });

  it("keeps an anticlockwise sweep through 180° anticlockwise and small", () => {
    const wedge = sweptWedge(arc(190, 170), origin, 10);
    expect(wedge.anticlockwise).toBe(true);
    expect(degrees(wedge)).toBeCloseTo(-20, 6);
  });

  it("caps at one full turn", () => {
    expect(Math.abs(degrees(sweptWedge(arc(0, 400, 40), origin, 40)))).toBe(
      360,
    );
  });

  it("follows Wide orbit's half turn one way all the way", () => {
    const plate = PLATE_BY_ID["wide-orbit"];
    const input: RadarInput = {
      trace: plateTrace(plate, SCENE_BY_ID.set, rig, []),
      t: 1,
      layers: [],
    };
    const at = radarProjector("top", 300, 150, radarRange(input, "top"));
    const points = input.trace.map(at);
    const centre = at([0, 0, 0]);
    const sweeps = [0.25, 0.5, 0.75, 1].map((t) =>
      degrees(sweptWedge(points, centre, Math.round(t * (points.length - 1)))),
    );
    // One direction throughout, growing to the move's 180°.
    expect(new Set(sweeps.map(Math.sign)).size).toBe(1);
    sweeps
      .slice(1)
      .forEach((s, i) =>
        expect(Math.abs(s)).toBeGreaterThan(Math.abs(sweeps[i])),
      );
    expect(Math.abs(sweeps[3])).toBeCloseTo(180, 0);
  });
});

/** A 2D context stand-in: `arc` rejects a negative radius as browsers do. */
function fakeCanvas(width: number, height: number) {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "createRadialGradient") return () => ({ addColorStop() {} });
      if (key === "arc")
        return (_x: number, _y: number, r: number) => {
          if (r < 0)
            throw new DOMException(
              "The radius provided is negative.",
              "IndexSizeError",
            );
          calls.push("arc");
        };
      return (..._args: unknown[]) => calls.push(key);
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  const canvas = {
    clientWidth: width,
    clientHeight: height,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

describe("undersized panes", () => {
  const palette = {
    wash: ["#222", "#111"] as [string, string],
    path: "#0ff",
    end: "#fc0",
    subject: "#9c3",
    start: "#888",
    grid: "#333",
    label: "#aaa",
    layers: ["#0ff", "#fc0"],
  };
  const input = (id: string): RadarInput => ({
    trace: plateTrace(PLATE_BY_ID[id], SCENE_BY_ID.set, rig, []),
    t: 0.5,
    layers: sampleRig(PLATE_BY_ID[id], rig, 0.5).layers,
  });

  it("does not throw on a 27 px pane and draws only the wash", () => {
    for (const plate of PLATES)
      for (const view of ["top", "side"] as const)
        for (const [w, h] of [
          [27, 150],
          [150, 27],
          [27, 27],
          [1, 1],
        ]) {
          const { canvas, calls } = fakeCanvas(w, h);
          expect(() =>
            drawRadar(canvas, view, input(plate.id), palette),
          ).not.toThrow();
          expect(calls).toEqual(["fillRect"]);
        }
  });

  it("draws in full from the minimum size up", () => {
    for (const view of ["top", "side"] as const) {
      const { canvas, calls } = fakeCanvas(RADAR_MIN_SIZE, RADAR_MIN_SIZE);
      expect(() =>
        drawRadar(canvas, view, input("wide-orbit"), palette),
      ).not.toThrow();
      expect(calls.filter((c) => c === "arc").length).toBeGreaterThan(3);
      expect(calls).toContain("fillText");
    }
  });

  it("projects to the centre, never a negative scale, below the margins", () => {
    for (const view of ["top", "side"] as const) {
      const at = radarProjector(view, 20, 20, 10);
      const a = at([5, 5, 5]);
      const b = at([-5, 5, -5]);
      // A zero scale collapses the path rather than mirroring it.
      expect(a).toEqual(b);
    }
  });
});
