import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  anchorItems,
  anchorPrompt,
  anchorRequest,
  type AnchorBox,
} from "../shared/openjutsu-anchor";
import { readLayout } from "../shared/image-layout";
import { validateInput } from "../server/validation";
import { requireRoute } from "../shared/provider";

// The swap's first frame as a Klein box edit: an ordinary flux-3-klein-api
// image run whose rows the server reads back like any studio edit.
const ref = `data:image/png;base64,${readFileSync(new URL("./fixtures/reference.png", import.meta.url)).toString("base64")}`;
const person: AnchorBox = {
  box: [100, 300, 1000, 700],
  target: "person",
  reference: 0,
};
const hat: AnchorBox = {
  box: [50, 380, 220, 620],
  target: "hat",
  reference: 0,
};
const shirt: AnchorBox = {
  box: [300, 320, 650, 680],
  target: "shirt",
  reference: 1,
};

describe("the Klein first frame", () => {
  it("swaps the whole person with Openjutsu's instruction and an edit row", () => {
    const request = anchorRequest({
      frame: ref,
      references: [ref],
      boxes: [person],
    });
    expect(request).toMatchObject({
      generator: "image",
      model: "flux-3-klein-api",
      imageReferences: [ref, ref],
      imageAspectRatio: "auto",
      imageResolution: "1k",
    });
    expect(request.description).toMatch(
      /^Replace the person in image 1 with the character from image 2, including their face, hair, body and complete outfit/,
    );
    const layout = readLayout(request.description, 2);
    expect(layout.rows).toEqual([
      {
        id: "box_1",
        desc: "the character from image 2, the whole person",
        from: "ref_image_1",
        src_bbox: [0, 0, 1000, 1000],
        tgt_bbox: [100, 300, 1000, 700],
      },
    ]);
    // The existing edit route takes it: validated on the Klein API, BFL key.
    const input = validateInput(request);
    expect(input.imageReferences).toHaveLength(2);
    expect(() =>
      requireRoute("image", "flux-3-klein-api", "bfl-key"),
    ).not.toThrow();
    expect(anchorItems([person])).toEqual([]);
  });

  it("changes only the boxed items, each from its own reference", () => {
    const prompt = anchorPrompt([hat, shirt]);
    expect(prompt).toMatch(
      /^On the person in image 1, replace the hat with the one in image 2; replace the shirt with the one in image 3, and keep their face, hair and the rest of their outfit\. Keep image 1's pose/,
    );
    const rows = readLayout(prompt, 3).rows!;
    expect(rows.map((r) => [r.from, r.tgt_bbox])).toEqual([
      ["ref_image_1", [50, 380, 220, 620]],
      ["ref_image_2", [300, 320, 650, 680]],
    ]);
    expect(anchorItems([hat, shirt])).toEqual(["hat", "shirt"]);
  });

  it("refuses boxes off the grid, inverted, or naming a missing reference", () => {
    const base = { frame: ref, references: [ref] };
    for (const boxes of [
      [],
      [{ ...person, box: [0, 0, 1001, 10] }],
      [{ ...person, box: [500, 0, 400, 10] }],
      [{ ...hat, reference: 1 }],
      [{ ...hat, target: "<script>" }],
    ] as AnchorBox[][])
      expect(() => anchorRequest({ ...base, boxes })).toThrow();
  });
});
