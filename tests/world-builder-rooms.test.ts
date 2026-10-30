import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { presetRecipe, validateRecipe } from "../src/world-builder/recipe";
import { roomSets, type RoomId } from "../src/world-builder/room-presets";
import { DISPLAY_DIMENSIONS } from "../src/scene/akuspace/scene-layout.js";

const presets: Record<RoomId, string> = {
  small_room: "Small room",
  medium_room: "Acoustic room",
  empty_club: "Club",
  cathedral: "Cathedral",
};

describe("World Builder room library", () => {
  it("builds every set from the shared acoustics table and ships it as an example", () => {
    for (const [id, name] of Object.entries(presets) as [RoomId, string][]) {
      const r = presetRecipe(name);
      const [width, length, height] = roomSets[id].size_m;
      const floor = r.objects.find((p) => p.id === "room-floor")!;
      const north = r.objects.find((p) => p.id === "room-north")!;
      expect(floor.scale * floor.scaleX! * 2).toBeCloseTo(width, 6);
      expect(floor.scale * floor.scaleY! * 2).toBeCloseTo(length, 6);
      expect(north.scale * north.scaleY! * 2).toBeCloseTo(height, 6);
      expect(floor.prompt).toBe(roomSets[id].materials.floor);
      expect(north.prompt).toBe(roomSets[id].materials.walls);
      const example = JSON.parse(
        readFileSync(
          `custom_nodes/director_world_builder/examples/rooms/${id}.json`,
          "utf8",
        ),
      );
      expect(validateRecipe(example)).toEqual(r);
    }
  });
  it("keeps the existing acoustic sets at Acoustic Space's display sizes", () => {
    expect(roomSets.medium_room.size_m).toEqual([
      ...DISPLAY_DIMENSIONS.medium_room,
    ]);
    expect(roomSets.empty_club.size_m).toEqual([
      ...DISPLAY_DIMENSIONS.empty_club,
    ]);
  });
  it("writes a valid depth range into the recipe", () => {
    expect(presetRecipe("Cathedral")).toMatchObject({
      depthNear: 0.1,
      depthFar: 50,
    });
    expect(() =>
      validateRecipe({ ...presetRecipe("Studio"), depthNear: 5, depthFar: 5 }),
    ).toThrow(/depthFar/);
  });
});
