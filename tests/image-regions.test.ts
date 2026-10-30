import { describe, expect, it } from "vitest";
import {
  imagePrompt,
  remapReferences,
  transformBox,
  regionBlocker,
  type ImageRegion,
} from "../src/image-regions";
const region: ImageRegion = {
  id: "chair_1",
  box: [100, 200, 600, 800],
  action: "change",
  description: "a chrome chair",
  referenceIndex: 2,
  label: [800, 20],
};
const rows = (regions: ImageRegion[], edit = true) =>
  JSON.parse(imagePrompt("Scene", regions, edit).split(". ").at(-1)!);
describe("editable image regions", () => {
  it("preserves size when movement reaches frame edges", () => {
    expect(transformBox(region.box, "move", 500, -400)).toEqual([
      0, 400, 500, 1000,
    ]);
    expect(transformBox(region.box, "move", -999, 999)).toEqual([
      500, 0, 1000, 600,
    ]);
  });
  it("clamps all resize corners without inversion", () => {
    expect(transformBox(region.box, "nw", 900, 900)).toEqual([
      590, 790, 600, 800,
    ]);
    expect(transformBox(region.box, "se", -900, -900)).toEqual([
      100, 200, 110, 210,
    ]);
    expect(transformBox(region.box, "ne", 900, -900)).toEqual([
      0, 200, 600, 1000,
    ]);
    expect(transformBox(region.box, "sw", -900, 900)).toEqual([
      100, 0, 1000, 800,
    ]);
  });
  it("keeps the other axis fixed when resizing an edge", () => {
    expect(transformBox(region.box, "e", 100, 300)).toEqual([
      100, 200, 600, 900,
    ]);
    expect(transformBox(region.box, "n", 500, -50)).toEqual([
      50, 200, 600, 800,
    ]);
  });
  it("binds pulled references to the actual image index and excludes label coordinates", () => {
    expect(rows([region])).toEqual([
      {
        id: "chair_1",
        from: "ref_image_2",
        src_bbox: [0, 0, 1000, 1000],
        tgt_bbox: region.box,
        desc: "a chrome chair",
      },
    ]);
    expect(imagePrompt("Scene", [region], true)).not.toContain('"label"');
  });
  it("serializes keep, move, and remove using the original source frame", () => {
    const target: [number, number, number, number] = [0, 0, 400, 400];
    const actual = rows(
      ["keep", "move", "remove"].map((action) => ({
        ...region,
        action: action as ImageRegion["action"],
        target,
      })),
    );
    expect(
      actual.map((r: Record<string, unknown>) => [
        r.from,
        r.src_bbox,
        r.tgt_bbox,
      ]),
    ).toEqual([
      ["ref_image_0", region.box, region.box],
      ["ref_image_0", region.box, target],
      ["ref_image_0", region.box, null],
    ]);
  });
  it("remaps assignments after reorder and detaches removed references", () => {
    expect(remapReferences([region], [0, 2, 1])[0].referenceIndex).toBe(1);
    expect(remapReferences([region], [0, 1])[0].referenceIndex).toBeUndefined();
    expect(rows(remapReferences([region], [0, 1]))[0].from).toBeNull();
  });
  it("requires a layout description but lets references and keep/remove speak for themselves", () => {
    const empty = { ...region, description: "" };
    expect(regionBlocker([empty], true)).toBeNull();
    expect(regionBlocker([empty], false)).toContain("box 1");
    expect(
      regionBlocker([{ ...empty, referenceIndex: undefined }], true),
    ).toContain("box 1");
    expect(regionBlocker([{ ...empty, action: "keep" }], true)).toBeNull();
  });
});
