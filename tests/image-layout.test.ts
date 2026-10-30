import { describe, expect, it } from "vitest";
import {
  LayoutError,
  MAX_LAYOUT_ROWS,
  readLayout,
} from "../shared/image-layout";
import { imagePrompt, type ImageRegion } from "../src/image-regions";
import { validateInput } from "../server/validation";

const region: ImageRegion = {
  id: "region_1",
  box: [100, 200, 600, 800],
  action: "change",
  description: "a red kite",
};
const row = (bbox: unknown, id = "kite_1") =>
  `A beach. ${JSON.stringify([{ id, bbox, desc: "a kite" }])}`;

describe("layout rows read back from a prompt", () => {
  it("splits what src/image-regions.ts writes into caption and rows", () => {
    const prompt = imagePrompt("A beach at noon.", [region], false);
    const layout = readLayout(prompt);
    expect(layout.rows).toEqual([
      { id: "region_1", desc: "a red kite", bbox: [100, 200, 600, 800] },
    ]);
    expect(layout.caption).toBe(
      "A beach at noon.\n\nplace <region_1> at the center.",
    );
    expect(`${layout.caption} ${layout.json}`).toBe(prompt);
  });

  it("reads edit rows, with null boxes and named references", () => {
    const prompt = imagePrompt(
      "Edit.",
      [
        { ...region, action: "remove" },
        { ...region, id: "region_2", referenceIndex: 1 },
      ],
      true,
    );
    const { rows } = readLayout(prompt, 2);
    expect(rows).toMatchObject([
      { id: "region_1", from: "ref_image_0", tgt_bbox: null },
      { id: "region_2", from: "ref_image_1", src_bbox: [0, 0, 1000, 1000] },
    ]);
    // A row naming an image the request does not carry is refused.
    expect(() => readLayout(prompt, 1)).toThrow(LayoutError);
  });

  it("leaves a prompt without rows, or ending in other JSON, as text", () => {
    for (const prompt of [
      "A plain prompt.",
      "A sign reading [1, 2, 3]",
      'A list [{"name":"no box here"}]',
    ])
      expect(readLayout(prompt)).toEqual({
        caption: prompt,
        rows: null,
        json: "",
      });
  });

  it("refuses boxes off BFL's 0–1000 grid, inverted or fractional", () => {
    for (const bbox of [
      [0, 0, 1001, 500],
      [-1, 0, 500, 500],
      [0, 0, 500.5, 500],
      [500, 0, 400, 500],
      [0, 600, 500, 600],
      [0, 0, 500],
      ["0", 0, 500, 500],
    ])
      expect(() => readLayout(row(bbox)), JSON.stringify(bbox)).toThrow(
        LayoutError,
      );
    expect(readLayout(row([0, 0, 1000, 1000])).rows).toHaveLength(1);
  });

  it("refuses repeated or malformed ids, empty edit rows and too many rows", () => {
    const two = `A. ${JSON.stringify([
      { id: "a_1", bbox: [0, 0, 10, 10], desc: "" },
      { id: "a_1", bbox: [0, 0, 10, 10], desc: "" },
    ])}`;
    expect(() => readLayout(two)).toThrow("own id");
    expect(() => readLayout(row([0, 0, 10, 10], "1bad"))).toThrow("own id");
    const empty = `A. ${JSON.stringify([
      { id: "a_1", from: null, src_bbox: null, tgt_bbox: null, desc: "" },
    ])}`;
    expect(() => readLayout(empty)).toThrow("source box, a target box");
    const many = `A. ${JSON.stringify(
      Array.from({ length: MAX_LAYOUT_ROWS + 1 }, (_, i) => ({
        id: `a_${i}`,
        bbox: [0, 0, 10, 10],
        desc: "",
      })),
    )}`;
    expect(() => readLayout(many)).toThrow(`at most ${MAX_LAYOUT_ROWS}`);
  });

  it("finds pretty-printed rows, however the array is spaced", () => {
    const rows = [{ id: "kite_1", bbox: [100, 200, 600, 800], desc: "a kite" }];
    for (const json of [
      JSON.stringify(rows, null, 2),
      JSON.stringify(rows, null, "\t"),
      `[ \n\n  ${JSON.stringify(rows[0])} ]`,
    ]) {
      const prompt = `A beach.\n${json}\n`;
      const layout = readLayout(prompt);
      expect(layout.rows, json).toEqual(rows);
      expect(layout.caption).toBe("A beach.");
      expect(layout.json).toBe(json);
    }
  });

  it("refuses an off-grid box in pretty-printed rows on both adapters' validator", () => {
    const pretty = `A beach.\n${JSON.stringify(
      [{ id: "kite_1", bbox: [0, 0, 1200, 500], desc: "a kite" }],
      null,
      2,
    )}`;
    expect(() => readLayout(pretty)).toThrow(LayoutError);
    for (const model of ["flux-3", "flux-3-klein", "flux-3-klein-api"])
      expect(() =>
        validateInput({
          generator: "image",
          model,
          description: pretty,
          imageAspectRatio: "1:1",
        }),
      ).toThrow("0 to 1000");
  });

  it("finds the rows after prose full of bracketed objects", () => {
    const noise = Array.from({ length: 80 }, (_, i) => `[{"n":${i}}]`).join(
      " ",
    );
    const prompt = `${noise} ${row([0, 0, 1001, 10])}`;
    expect(() => readLayout(prompt)).toThrow("0 to 1000");
  });

  it("is checked by the request validator both adapters share", () => {
    const image = { generator: "image", description: row([0, 0, 2000, 10]) };
    expect(() => validateInput(image)).toThrow("0 to 1000");
    expect(() =>
      validateInput({
        ...image,
        model: "flux-3-klein",
        imageAspectRatio: "1:1",
      }),
    ).toThrow("0 to 1000");
    expect(
      validateInput({ ...image, description: row([0, 0, 1000, 10]) })
        .description,
    ).toContain('"bbox":[0,0,1000,10]');
  });
});
