import { describe, expect, it } from "vitest";
import presets from "../shared/akuspace-presets.json";
import { roomAcoustics, type Acoustics } from "../shared/scene/acoustics";
import { applyCommand } from "../shared/scene/commands";
import { SCENES } from "../src/scene3d/scenes";
import {
  bathroom,
  club,
  curtained,
  mediumRoom,
  nave,
  sceneWith,
} from "./scene-fixtures";

const expected = (id: string) =>
  (presets.presets as Record<string, { estimated_rt60: number }>)[id]
    .estimated_rt60;
const of = (scene: ReturnType<typeof nave>) => roomAcoustics(scene)!;
const band = (a: Acoustics, hz: number) => a.bands.find((b) => b.hz === hz)!;

describe("room acoustics from scene geometry", () => {
  const rooms = [
    ["small_room", bathroom()],
    ["empty_club", club()],
    ["medium_room", mediumRoom()],
    ["cathedral", nave()],
  ] as const;

  it("lands the four reference rooms within 25% of AKUSPACE's estimated RT60, in order", () => {
    const measured = rooms.map(([preset, scene]) => {
      const a = of(scene);
      const target = expected(preset);
      expect(a.rt60Mid, preset).toBeGreaterThan(target * 0.75);
      expect(a.rt60Mid, preset).toBeLessThan(target * 1.25);
      expect(a.nearestPreset.id, preset).toBe(preset);
      return a.rt60Mid;
    });
    for (let i = 1; i < measured.length; i++)
      expect(measured[i]).toBeGreaterThan(measured[i - 1]);
  });

  it("uses Sabine for live rooms and switches to Eyring for a heavily curtained one", () => {
    expect(of(mediumRoom()).formula).toBe("sabine");
    const a = of(curtained());
    expect(band(a, 500).meanAlpha).toBeGreaterThan(0.2);
    expect(band(a, 500).formula).toBe("eyring");
    const sabine = (0.161 * a.volumeM3) / band(a, 500).absorption;
    expect(band(a, 500).rt60).toBeLessThan(sabine);
    expect(band(a, 125).formula).toBe("sabine");
  });

  it("adds air absorption above 2 kHz only in large rooms", () => {
    const a = of(nave());
    expect(a.volumeM3).toBeGreaterThan(500);
    const four = band(a, 4000);
    expect(four.air).toBe(true);
    expect(four.rt60).toBeLessThan((0.161 * a.volumeM3) / four.absorption);
    expect(band(a, 1000).air).toBe(false);
    expect(of(mediumRoom()).bands.some((b) => b.air)).toBe(false);
  });

  it("grows critical distance with volume", () => {
    const distances = rooms.map(([, scene]) => of(scene).criticalDistanceM);
    expect(distances[3]).toBeGreaterThan(distances[2]);
    expect(distances[2]).toBeGreaterThan(distances[0]);
    const a = of(mediumRoom());
    expect(a.criticalDistanceM).toBeCloseTo(
      0.057 * Math.sqrt(a.volumeM3 / a.rt60Mid),
      2,
    );
  });

  it("sets pre-delay from the nearest surface: twice its distance at 343 m/s", () => {
    let scene = mediumRoom();
    scene = applyCommand(
      scene,
      { op: "set-subject", subject: [3, 1.6, 0] },
      scene.revision,
    );
    // The east wall's inner face is at x = 3.5, 0.5 m away.
    expect(of(scene).preDelayMs).toBeCloseTo(((0.5 * 2) / 343) * 1000, 2);
  });

  it("reports early reflections from each closed surface, after the direct sound", () => {
    const a = of(mediumRoom());
    expect(a.earlyReflections).toHaveLength(6);
    for (const r of a.earlyReflections) {
      expect(r.delayMs).toBeGreaterThanOrEqual(0);
      expect(r.gain).toBeGreaterThan(0);
      expect(r.gain).toBeLessThan(1);
    }
    expect(a.listener).toEqual([0, 1.2, 3]);
  });

  it("counts a door as an opening and an open top as fully absorbent", () => {
    expect(of(mediumRoom()).openingM2).toBeCloseTo(0.9 * 2.1, 2);
    const open = applyCommand(
      mediumRoom(),
      {
        op: "room",
        width: 7,
        length: 9,
        height: 3.2,
        wallMaterial: "plaster",
        floorMaterial: "wood",
        ceilingMaterial: "plaster",
        openTop: true,
      },
      2,
    );
    expect(of(open).openingM2).toBeCloseTo(63, 1);
    expect(of(open).rt60Mid).toBeLessThan(of(mediumRoom()).rt60Mid / 3);
  });

  it("returns null for an open set and the built-in scenes", () => {
    for (const scene of SCENES) expect(roomAcoustics(scene)).toBeNull();
  });
});

it.each([
  { wall: "north", offset: 0, width: 0.9, height: 2.45 },
  { wall: "east", offset: 2, width: 0.9, height: 2 },
] as const)(
  "keeps the full room interior around a thin door piece: %o",
  (door) => {
    const a = roomAcoustics(
      sceneWith({
        width: 4,
        length: 5,
        height: 2.5,
        wallMaterial: "plaster",
        floorMaterial: "wood",
        ceilingMaterial: "plaster",
        door,
      }),
    )!;
    [-2, 0, -2.5].forEach((value, i) =>
      expect(a.interior.min[i]).toBeCloseTo(value, 10),
    );
    [2, 2.5, 2.5].forEach((value, i) =>
      expect(a.interior.max[i]).toBeCloseTo(value, 10),
    );
    expect(a.volumeM3).toBe(50);
    expect(a.openingM2).toBeCloseTo(door.width * door.height, 2);
  },
);
