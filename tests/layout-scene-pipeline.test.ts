import { describe, expect, it } from "vitest";
import party from "../workflows/world-builder-l2r-a2v.json";
import studio from "../workflows/world-builder-l2r-a2v-studio.json";

describe.each([
  ["Party", party],
  ["Studio", studio],
] as const)("%s combined layout and room-sound workflow", (_name, graph) => {
  it("uses one frozen scene for layout guidance, acoustics and CPU reverb, then muxes that wet mix", () => {
    expect(graph["2"].inputs.recipe).toEqual(["1", 3]);
    expect(graph["10"].inputs.recipe).toEqual(["1", 3]);
    expect(graph["4"].inputs.room_preset).toEqual(["2", 6]);
    expect(graph["5"].inputs.image).toEqual(["1", 0]);
    expect(graph["9"].inputs.input).toEqual(["5", 0]);
    for (const id of ["70", "72"] as const)
      expect(graph[id].inputs.image).toEqual(["9", 0]);
    expect(graph["1"].inputs.audio).toEqual(["40", 0]);
    expect(graph["10"].inputs.audio).toEqual(["1", 1]);
    expect(graph["60"].inputs.audio).toEqual(["10", 0]);
    expect(graph["61"].inputs.video).toEqual(["60", 0]);
    expect(graph["11"].inputs.audio).toEqual(["10", 1]);
    expect(graph["13"].inputs.audio).toEqual(["10", 0]);
  });
});
