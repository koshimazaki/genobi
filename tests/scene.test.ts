import { describe, expect, it } from "vitest";
import { applyCommand, createScene } from "../shared/scene/commands";
import { parseScene } from "../shared/scene/parse";
import { sceneHandoff } from "../shared/scene/prompts";
import { roomBox } from "../shared/scene/room";
import { SCENE_LIMITS } from "../shared/scene/types";
import { SCENES } from "../src/scene3d/scenes";
import { mediumRoom } from "./scene-fixtures";

const box = {
  id: "crate",
  shape: "box",
  position: [1, 0.5, 1],
  size: [1, 1, 1],
  colour: "dark",
};
const withObject = (patch: Record<string, unknown>) => ({
  ...createScene("test"),
  objects: [{ ...box, ...patch }],
});

describe("scene documents", () => {
  it("accepts both built-in scenes unchanged", () => {
    for (const scene of SCENES) expect(parseScene(scene)).toEqual(scene);
  });

  it("refuses unknown shapes, colours, materials, roles and fields with a reason", () => {
    expect(() => parseScene(withObject({ shape: "teapot" }))).toThrow(
      /Unknown shape "teapot"/,
    );
    expect(() => parseScene(withObject({ colour: "red" }))).toThrow(
      /Unknown colour/,
    );
    expect(() => parseScene(withObject({ material: "velvet" }))).toThrow(
      /Unknown material "velvet"/,
    );
    expect(() => parseScene(withObject({ role: "roof" }))).toThrow(
      /Unknown role/,
    );
    expect(() =>
      parseScene(withObject({ role: "wall", shape: "sphere" })),
    ).toThrow(/wall must be a box/);
    expect(() => parseScene(withObject({ script: "alert(1)" }))).toThrow(
      /unknown field "script"/,
    );
    expect(() => parseScene({ ...createScene(), version: 2 })).toThrow(
      /version 1/,
    );
  });

  it("refuses out-of-range numbers and oversize scenes", () => {
    const bad: Record<string, unknown>[] = [
      { size: [0.001, 1, 1] },
      { size: [201, 1, 1] },
      { position: [501, 0, 0] },
      { position: [Number.NaN, 0, 0] },
      { position: [0, 0] },
    ];
    for (const patch of bad)
      expect(
        () => parseScene(withObject(patch)),
        JSON.stringify(patch),
      ).toThrow();
    const base = createScene();
    expect(() => parseScene({ ...base, fov: 5 })).toThrow(/Field of view/);
    expect(() => parseScene({ ...base, fov: 121 })).toThrow(/Field of view/);
    expect(() => parseScene({ ...base, scale: 0.05 })).toThrow(/Scale/);
    expect(() => parseScene({ ...base, scale: 21 })).toThrow(/Scale/);
    expect(() => parseScene({ ...base, id: "Bad Id" })).toThrow(/lowercase/);
    const many = Array.from(
      { length: SCENE_LIMITS.primitives + 1 },
      (_, i) => ({
        ...box,
        id: `p-${i}`,
      }),
    );
    expect(() => parseScene({ ...base, objects: many })).toThrow(/up to 200/);
    expect(() => parseScene({ ...base, objects: [box, { ...box }] })).toThrow(
      /Duplicate/,
    );
  });

  it("strips control characters from labels and summaries and caps their length", () => {
    const scene = parseScene({
      ...createScene(),
      label: "Bath\x00room\x1b[31m\x7f",
      summary: `Tiles\n\tand a door ${"x".repeat(400)}`,
    });
    expect(scene.label).toBe("Bath room [31m");
    expect(scene.summary).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(scene.summary.length).toBeLessThanOrEqual(SCENE_LIMITS.summary);
    expect(() => parseScene({ ...createScene(), label: "\x01\x02" })).toThrow(
      /label/,
    );
  });

  it("keeps the subject inside the walls", () => {
    const room = mediumRoom();
    expect(() => parseScene({ ...room, subject: [10, 1, 0] })).toThrow(
      /inside the room/,
    );
    expect(() =>
      applyCommand(
        room,
        { op: "set-subject", subject: [0, 5, 0] },
        room.revision,
      ),
    ).toThrow(/inside the room/);
  });
});

describe("scene commands", () => {
  it("adds, changes and removes primitives, counting the revision", () => {
    let doc = createScene("set", "Set");
    doc = applyCommand(doc, { op: "add-primitive", primitive: box }, 0);
    expect(doc.revision).toBe(1);
    doc = applyCommand(
      doc,
      {
        op: "set-primitive",
        id: "crate",
        material: "wood",
        position: [2, 0.5, 0],
      },
      1,
    );
    expect(doc.objects[0]).toMatchObject({
      material: "wood",
      position: [2, 0.5, 0],
    });
    doc = applyCommand(doc, { op: "set-camera", fov: 50, scale: 0.5 }, 2);
    expect([doc.fov, doc.scale]).toEqual([50, 0.5]);
    doc = applyCommand(
      doc,
      {
        op: "set-content",
        content: { kind: "acoustic-room", room: "cathedral" },
      },
      3,
    );
    expect(doc.content).toEqual({ kind: "acoustic-room", room: "cathedral" });
    doc = applyCommand(doc, { op: "remove-primitive", id: "crate" }, 4);
    expect(doc.objects).toEqual([]);
    expect(doc.revision).toBe(5);
  });

  it("refuses a stale revision, an unknown command, stray fields and duplicates", () => {
    const doc = applyCommand(
      createScene(),
      { op: "add-primitive", primitive: box },
      0,
    );
    expect(() => applyCommand(doc, { op: "set-camera", fov: 40 }, 0)).toThrow(
      /revision/,
    );
    expect(() => applyCommand(doc, { op: "explode" }, 1)).toThrow(
      /Unknown command/,
    );
    expect(() =>
      applyCommand(doc, { op: "set-camera", fov: 40, colour: "dark" }, 1),
    ).toThrow(/unknown field/);
    expect(() =>
      applyCommand(doc, { op: "add-primitive", primitive: box }, 1),
    ).toThrow(/already exists/);
    expect(() =>
      applyCommand(
        doc,
        { op: "add-primitive", primitive: { ...box, id: undefined } },
        1,
      ),
    ).toThrow(/needs an id/);
    expect(() =>
      applyCommand(doc, { op: "remove-primitive", id: "ghost" }, 1),
    ).toThrow(/No primitive/);
  });
});

describe("roomBox", () => {
  const options = {
    width: 4,
    length: 6,
    height: 3,
    wallMaterial: "plaster",
    floorMaterial: "wood",
    ceilingMaterial: "plaster",
  } as const;

  it("builds six boxes with roles around the interior, or five with an open top", () => {
    const parts = roomBox(options);
    expect(parts).toHaveLength(6);
    expect(parts.every((p) => p.shape === "box")).toBe(true);
    expect(parts.map((p) => p.role).sort()).toEqual([
      "ceiling",
      "floor",
      "wall",
      "wall",
      "wall",
      "wall",
    ]);
    const floor = parts.find((p) => p.role === "floor")!;
    expect(floor.position[1] + floor.size[1] / 2).toBeCloseTo(0);
    expect(roomBox({ ...options, openTop: true })).toHaveLength(5);
  });

  it("leaves a gap for a door, with a lintel above it", () => {
    const parts = roomBox({
      ...options,
      door: { wall: "south", offset: 1, width: 1, height: 2 },
    });
    const south = parts.filter((p) => p.id?.startsWith("room-wall-south"));
    expect(south.map((p) => p.id)).toEqual([
      "room-wall-south-a",
      "room-wall-south-b",
      "room-wall-south-lintel",
    ]);
    const [a, b, lintel] = south;
    expect(a.position[0] + a.size[0] / 2).toBeCloseTo(0.5);
    expect(b.position[0] - b.size[0] / 2).toBeCloseTo(1.5);
    expect(lintel.position[1] - lintel.size[1] / 2).toBeCloseTo(2);
    expect(() =>
      roomBox({
        ...options,
        door: { wall: "east", offset: 2.8, width: 1, height: 2 },
      }),
    ).toThrow(/fit inside/);
    expect(() =>
      roomBox({ ...options, wallMaterial: "stone" as "plaster" }),
    ).toThrow(/Unknown Wall material "stone"/);
  });

  it("replaces an earlier room and describes it in one paragraph", () => {
    const doc = mediumRoom();
    const smaller = applyCommand(doc, { op: "room", ...options }, doc.revision);
    expect(smaller.objects.filter((p) => p.role).length).toBe(6);
    expect(smaller.objects.some((p) => p.id === "sofa")).toBe(true);
    const text = sceneHandoff(doc);
    expect(text).toMatch(/7 m × 9 m room, 3\.2 m high, with plaster walls/);
    expect(text).toMatch(/a wood floor/);
    expect(text).toMatch(/1\.9 m² in the south wall/);
    expect(text).not.toMatch(/\n/);
    expect(sceneHandoff(SCENES[0])).toMatch(/open set/);
  });
});
