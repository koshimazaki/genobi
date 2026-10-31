import { describe, expect, it } from "vitest";
import { validateRecipe } from "../src/world-builder/recipe";
import { createStoryPreset } from "../src/world-builder/story-presets";
import {
  acousticZoneAt,
  acousticZoneAbsorption,
  scaleAcousticZones,
  validateSceneAcousticZones,
  type IndoorAcousticZone,
  type SceneAcousticZone,
} from "../src/world-builder/scene-acoustic-zones";
import { evaluateAcousticEnvironment } from "../src/world-builder/evaluate-acoustic-environment";
import {
  acousticWeightsAt,
  buildAcousticSchedule,
  validateAcousticSchedule,
  type AcousticSchedule,
  type AcousticSnapshot,
} from "../src/world-builder/acoustic-schedule";
import { selectAcousticSnapshots } from "../src/world-builder/acoustic-sampling";
import { renderDynamicRoomAudio } from "../src/world-builder/dynamic-room-audio";
import {
  ROOM_AUDIO_ENGINE,
  roomRt60,
} from "../src/world-builder/scene-room-ir";

const room = (): IndoorAcousticZone => ({
  id: "cathedral",
  label: "Cathedral",
  kind: "room",
  center: [0, 12, 0],
  dimensions: [24, 28, 36],
  source: [2, 1.5, -2],
  seed: 42,
  absorption: {
    floor: 0.08,
    ceiling: 0.1,
    north: 0.1,
    south: 0.1,
    east: 0.1,
    west: 0.1,
  },
  openings: [
    { face: "ceiling", areaM2: 240 },
    { face: "floor", areaM2: 96 },
  ],
});
const zones = (): SceneAcousticZone[] => [
  {
    id: "street",
    label: "City street",
    kind: "outdoor",
    center: [0, 40, 0],
    dimensions: [64, 100, 64],
  },
  room(),
  {
    ...room(),
    id: "club",
    label: "Club",
    center: [0, 4, 0],
    dimensions: [16, 8, 20],
    openings: [
      { face: "ceiling", areaM2: 96 },
      { face: "floor", areaM2: 24 },
    ],
  },
  {
    ...room(),
    id: "studio",
    label: "Studio",
    center: [0, 0, 0],
    dimensions: [8, 4, 10],
    openings: [{ face: "ceiling", areaM2: 24 }],
  },
];
function descent(frames = 721) {
  return validateRecipe({
    objects: [],
    frames,
    seconds: null,
    audioRoutes: [],
    avatar: true,
    motion: {
      version: 1,
      pivot: [0, 0, 0],
      intensity: 1,
      mappings: [],
      acousticZones: zones(),
      acousticListener: "camera",
      stateKeys: [
        {
          id: "start",
          label: "Start",
          frame: 0,
          easing: "linear",
          objects: {},
        },
      ],
    },
    cameraMotion: {
      version: 1,
      enabled: true,
      audio: { enabled: false, source: "sub", amount: 0 },
      keys: [
        {
          id: "sky",
          frame: 0,
          position: [0, 60, 0],
          target: [0, 59, 0],
          fov: 55,
          easing: "linear",
        },
        {
          id: "floor",
          frame: frames - 1,
          position: [0, 2, 0],
          target: [0, 1, 0],
          fov: 55,
          easing: "linear",
        },
      ],
    },
  });
}

describe("explicit metre-scale acoustic zones", () => {
  it("accepts authored open rooms but rejects invented outdoor materials, oversize holes and ambiguous IDs", () => {
    expect(validateSceneAcousticZones(zones())).toHaveLength(4);
    expect(() =>
      validateSceneAcousticZones([
        { ...zones()[0], absorption: room().absorption },
      ]),
    ).toThrow(/outdoors/);
    expect(() =>
      validateSceneAcousticZones([
        { ...room(), openings: [{ face: "floor", areaM2: 900 }] },
      ]),
    ).toThrow(/fit/);
    expect(() => validateSceneAcousticZones([room(), room()])).toThrow(
      /identity/,
    );
    const recipe = descent();
    recipe.motion!.room = {
      ...room(),
      listener: [0, 1.6, 0],
      visible: true,
      wallThickness: 0.1,
    };
    expect(() => validateRecipe(recipe)).toThrow();
  });
  it("uses world-space floor bounds, chooses the smaller nested room and stays dry outside", () => {
    expect(acousticZoneAt(zones(), [0, 40, 0])?.id).toBe("street");
    expect(acousticZoneAt(zones(), [0, 39.999, 0])?.id).toBe("cathedral");
    expect(acousticZoneAt(zones(), [0, 12, 0])?.id).toBe("cathedral");
    expect(acousticZoneAt(zones(), [0, 11.999, 0])?.id).toBe("club");
    expect(acousticZoneAt(zones(), [0, 2, 0])?.id).toBe("studio");
    expect(acousticZoneAt(zones(), [50, 20, 0])).toBeUndefined();
    const nested = {
      ...room(),
      id: "booth",
      center: [0, 13, 0] as [number, number, number],
      dimensions: [4, 4, 4] as [number, number, number],
    };
    expect(acousticZoneAt([room(), nested], [0, 14, 0])?.id).toBe("booth");
  });
  it("scales room geometry, sources and opening areas coherently without changing material coverage", () => {
    const original = room();
    const bigger = scaleAcousticZones(
      [original],
      2,
      [0, 0, 0],
    )[0] as IndoorAcousticZone;
    expect(bigger.dimensions).toEqual([48, 56, 72]);
    expect(bigger.center).toEqual([0, 24, 0]);
    expect(bigger.source).toEqual([4, 3, -4]);
    expect(bigger.openings?.[0].areaM2).toBe(960);
    expect(acousticZoneAbsorption(bigger)).toEqual(
      acousticZoneAbsorption(original),
    );
    const response = (zone: IndoorAcousticZone) => ({
      ...zone,
      listener: [0, 1.65, 0] as [number, number, number],
      absorption: acousticZoneAbsorption(zone),
    });
    expect(roomRt60(response(bigger))).toBeCloseTo(
      roomRt60(response(original)) * 2,
      10,
    );
    expect(roomRt60(response(original))).toBeLessThan(
      roomRt60({ ...response(original), absorption: original.absorption }),
    );
    expect(original.dimensions).toEqual([24, 28, 36]);
  });
  it("chooses the actual camera listener and labels the open-shaft estimate, with no street RT60", () => {
    const recipe = descent();
    expect(evaluateAcousticEnvironment(recipe, 0)).toMatchObject({
      kind: "dry",
      room: null,
      zone: { id: "street", kind: "outdoor" },
    });
    const inside = evaluateAcousticEnvironment(recipe, 600);
    expect(inside.kind).toBe("room");
    expect(inside.room!.dimensions).toEqual([16, 8, 20]);
    expect(inside.room!.listener[1]).toBeCloseTo(60 - (58 * 600) / 720 - 4);
    expect(inside.zone).toMatchObject({
      id: "club",
      approximation: "open-shaft-proxy",
      openingsAreaM2: 120,
    });
    recipe.motion!.acousticListener = "avatar";
    recipe.avatarPose = { x: 0, y: 0, z: 0, yaw: 0 };
    expect(evaluateAcousticEnvironment(recipe, 0).room!.listener[1]).toBe(1.65);
    expect(evaluateAcousticEnvironment(recipe, 0).zone.id).toBe("studio");
  });
});

describe("full-length zone schedules", () => {
  it("renders the actual descent through three explicit rooms and keeps Bass avenue dry", () => {
    const recipe = createStoryPreset("endless-descent");
    const schedule = buildAcousticSchedule(recipe);
    expect(validateAcousticSchedule(schedule)).toBe(schedule);
    expect(
      schedule.snapshots
        .filter((entry) => entry.transition === "hold")
        .map((entry) => entry.frame),
    ).toEqual([193, 289, 337]);
    expect([
      ...new Set(schedule.snapshots.map((entry) => entry.zone?.id)),
    ]).toEqual([
      "descent-street",
      "descent-cathedral",
      "descent-club",
      "descent-studio",
    ]);
    for (const entry of schedule.snapshots)
      expect(entry.room).toEqual(
        evaluateAcousticEnvironment(recipe, entry.frame).room,
      );
    const avenue = buildAcousticSchedule(createStoryPreset("bass-avenue"));
    expect(avenue.treatment).toBe("static");
    expect(avenue.snapshots).toHaveLength(1);
    expect(avenue.snapshots[0]).toMatchObject({
      room: null,
      zone: { kind: "outdoor" },
    });
  });
  it("keeps both sides of every 721-frame story boundary and its exact materials", () => {
    const recipe = descent();
    const schedule = buildAcousticSchedule(recipe);
    expect(validateAcousticSchedule(schedule)).toBe(schedule);
    expect(schedule.frames).toBe(721);
    expect(schedule.duration).toBe(721 / 24);
    expect(schedule.snapshots.length).toBeLessThanOrEqual(24);
    expect(schedule.snapshots[0].room).toBeNull();
    let crossings = 0;
    for (let frame = 1; frame < recipe.frames; frame++) {
      const before = evaluateAcousticEnvironment(recipe, frame - 1);
      const after = evaluateAcousticEnvironment(recipe, frame);
      if (before.zone.id === after.zone.id) continue;
      crossings++;
      expect(
        schedule.snapshots.some((entry) => entry.frame === frame - 1),
      ).toBe(true);
      expect(
        schedule.snapshots.find((entry) => entry.frame === frame),
      ).toMatchObject({
        transition: "hold",
        zone: after.zone,
        room: after.room,
      });
      // No reverb is introduced during the final fraction of an outdoor frame.
      if (before.kind === "dry")
        for (const weight of acousticWeightsAt(schedule, (frame - 0.01) / 24))
          if (weight.weight > 0)
            expect(schedule.snapshots[weight.index].room).toBeNull();
    }
    expect(crossings).toBe(3);
    expect(schedule.approximation!.boundaryFramesRetained).toBe(6);
    expect(schedule.approximation!.boundaryFramesTotal).toBe(6);
  });
  it("retains material changes even when geometric coordinates are identical", () => {
    const base = evaluateAcousticEnvironment(descent(), 600).room!;
    const all: AcousticSnapshot[] = Array.from({ length: 9 }, (_, frame) => ({
      frame,
      room: {
        ...base,
        absorption: { ...base.absorption, floor: frame < 3 ? 0.1 : 0.9 },
      },
    }));
    const result = selectAcousticSnapshots(all, [0, 8], [0, 8], 4);
    expect(result.snapshots.map((s) => s.frame)).toEqual([0, 2, 3, 8]);
    expect(result.snapshots[2].transition).toBe("hold");
    expect(() => selectAcousticSnapshots(all, [0, 8], [], 2)).toThrow(
      /boundaries/,
    );
  });
});

describe("explicit dry sound rendering", () => {
  const rate = 8000;
  const indoor = evaluateAcousticEnvironment(descent(), 600);
  const outside: AcousticSnapshot = {
    frame: 0,
    room: null,
    zone: { id: "street", label: "Street", kind: "outdoor" },
  };
  const schedule = (): AcousticSchedule => ({
    version: 1,
    engine: ROOM_AUDIO_ENGINE,
    treatment: "dynamic",
    frames: 9,
    fps: 24,
    duration: 9 / 24,
    sampleEveryFrames: 2,
    maxIRSeconds: 0.1,
    interpolation: "linear-wet-crossfade",
    controlAudio: "frozen-recipe-envelopes",
    snapshots: [
      outside,
      { ...outside, frame: 1 },
      { frame: 2, room: indoor.room, zone: indoor.zone, transition: "hold" },
      { frame: 5, room: indoor.room, zone: indoor.zone },
      { ...outside, frame: 6, transition: "hold" },
      { ...outside, frame: 8 },
    ],
  });
  const input = {
    sampleRate: rate,
    channels: [new Float32Array(3000).fill(0.1)],
    envelope: [],
  };
  it("omits every IR and tail for an outdoor-only take", async () => {
    const outdoor = {
      ...schedule(),
      treatment: "static" as const,
      snapshots: [outside],
    };
    let calls = 0;
    const result = await renderDynamicRoomAudio(
      input,
      outdoor,
      {},
      async () => {
        calls++;
        throw new Error("Outdoors must not convolve");
      },
    );
    expect(calls).toBe(0);
    expect(result.irs).toEqual([]);
    expect(result.tailSeconds).toBe(0);
    expect(result.track.channels[0]).toEqual(input.channels[0]);
  });
  it("has no wet signal before entering or after leaving a room, and no final outdoor tail", async () => {
    const result = await renderDynamicRoomAudio(
      input,
      schedule(),
      { dry: 0, wet: 1 },
      async (_source, _ir, _rate, length) => [
        new Float32Array(length).fill(0.25),
      ],
    );
    expect(result.irs).toHaveLength(1);
    expect(result.track.channels[0]).toHaveLength(3000);
    expect(
      result.track.channels[0].slice(0, 667).every((value) => value === 0),
    ).toBe(true);
    expect(result.track.channels[0][1000]).toBe(0.25);
    expect(
      result.track.channels[0].slice(2000).every((value) => value === 0),
    ).toBe(true);
    expect(result.tailSeconds).toBe(0);
    const missingBoundary = schedule();
    delete missingBoundary.snapshots[2].transition;
    expect(() => validateAcousticSchedule(missingBoundary)).toThrow(
      /boundaries/,
    );
  });
});
