/** Small reusable sets, in metres. Every part remains an editable primitive. */
import { roomBox } from "./room";
import type { ScenePrimitive, Vec3 } from "./types";

export const box = (
  id: string,
  position: Vec3,
  size: Vec3,
  material: ScenePrimitive["material"] = "concrete",
  colour: ScenePrimitive["colour"] = "dark",
): ScenePrimitive => ({ id, shape: "box", position, size, material, colour });

export function forest(): ScenePrimitive[] {
  return Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2;
    const radius = 8 + (i % 3) * 3;
    const x = Math.cos(angle) * radius,
      z = Math.sin(angle) * radius;
    const h = 4 + (i % 4);
    return [
      {
        ...box(
          `tree-${i}-trunk`,
          [x, h / 3, z],
          [0.35, (h * 2) / 3, 0.35],
          "wood",
        ),
        shape: "cylinder" as const,
      },
      {
        id: `tree-${i}-crown`,
        shape: "cone" as const,
        position: [x, h * 0.75, z] as Vec3,
        size: [1.6, h * 0.8, 1.6] as Vec3,
        colour: "acoustic" as const,
        material: "carpet" as const,
      },
    ];
  }).flat();
}

export function mountains(): ScenePrimitive[] {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `peak-${i}`,
    shape: "cone",
    position: [(i - 4) * 12, 5 + (i % 3) * 2, -22 - (i % 2) * 15],
    size: [9 + (i % 3), 10 + (i % 3) * 4, 9 + (i % 3)],
    colour: i % 2 ? "subject" : "dark",
    material: "concrete",
  }));
}

export function street(): ScenePrimitive[] {
  const out = [box("road", [0, -0.04, 0], [10, 0.08, 60], "concrete")];
  for (const side of [-1, 1]) {
    out.push(
      box(
        `walk-${side === -1 ? "west" : "east"}`,
        [side * 6, 0.1, 0],
        [2, 0.2, 60],
        "tile",
      ),
    );
    for (let row = 0; row < 4; row++) {
      const id = `block-${side === -1 ? "w" : "e"}-${row}`;
      const z = row * 12 - 20,
        h = 8 + (row % 3) * 4;
      out.push(box(id, [side * 11, h / 2, z], [8, h, 9], "concrete"));
      out.push({
        ...box(
          `${id}-sign`,
          [side * 6.9, h * 0.65, z],
          [0.1, 2.4, 4],
          "glass",
          "accent",
        ),
        glow: true,
      });
      for (let floor = 0; floor < 3; floor++)
        out.push(
          box(
            `${id}-window-${floor}`,
            [side * 6.95, 2 + floor * 2, z - 2.5],
            [0.08, 1, 1.4],
            "glass",
            "acoustic",
          ),
        );
    }
  }
  return out;
}

export function interior(cathedral = false): ScenePrimitive[] {
  const width = cathedral ? 14 : 8,
    length = cathedral ? 30 : 10,
    height = cathedral ? 12 : 3.4;
  const room = roomBox({
    width,
    length,
    height,
    wallMaterial: cathedral ? "concrete" : "plaster",
    floorMaterial: "wood",
    ceilingMaterial: "plaster",
    door: { wall: "south", offset: 0, width: 2, height: 2.5 },
  });
  if (cathedral) {
    for (const side of [-1, 1])
      for (let i = 0; i < 6; i++) {
        room.push({
          ...box(
            `column-${side === -1 ? "w" : "e"}-${i}`,
            [side * 4.5, 4.5, i * 4 - 10],
            [0.4, 9, 0.4],
          ),
          shape: "cylinder",
        });
        room.push(
          box(
            `pew-${side === -1 ? "w" : "e"}-${i}`,
            [side * 2.8, 0.45, i * 3 - 7],
            [3.2, 0.9, 0.7],
            "wood",
          ),
        );
      }
    room.push(
      box("altar", [0, 0.7, -12], [3.2, 1.4, 1.6], "concrete", "subject"),
    );
  } else {
    room.push(
      box("sofa", [-2.4, 0.45, -2], [2.4, 0.9, 0.8], "curtain", "subject"),
    );
    room.push(box("table", [0, 0.4, -1], [1.6, 0.8, 0.8], "wood"));
    room.push(
      box("rug", [0, 0.02, -1], [3.8, 0.04, 2.8], "carpet", "acoustic"),
    );
    room.push(box("cabinet", [3.4, 1, -3], [0.6, 2, 2], "wood"));
  }
  return room;
}

export function explodedHouse(): ScenePrimitive[] {
  // Deliberately not acoustic boundaries: an exploded model is an open display.
  return [
    box("foundation", [0, 0.25, 0], [8, 0.5, 9]),
    box("living-floor", [0, 1.5, 0], [8, 0.18, 9], "wood"),
    box("upper-floor", [0, 5, 0], [8, 0.18, 9], "wood", "subject"),
    box("roof", [0, 9, 0], [8.8, 0.3, 9.8], "metal"),
    box("west-wall", [-5.5, 3, 0], [0.15, 2.7, 9], "plaster"),
    box("east-wall", [5.5, 3, 0], [0.15, 2.7, 9], "glass"),
    box("back-wall", [0, 3, -6], [8, 2.7, 0.15], "plaster"),
    box("living-sofa", [-2, 2, -1.5], [2.5, 0.9, 1], "curtain", "acoustic"),
    box("upper-bed", [1, 5.5, -1], [2, 0.8, 2.6], "carpet", "accent"),
  ];
}
