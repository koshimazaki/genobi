import { describe, expect, it } from "vitest";
import { createScroll } from "../shared/scrolls/commands";
import { imageInput } from "../shared/scrolls/prompts";
import { parseScroll, type ScrollAsset } from "../shared/scrolls/types";
import {
  changeScrollKind,
  removalIds,
  removeScrollAsset,
} from "../src/scrolls/asset-edits";
import { scrollExamples } from "../src/scrolls/example-catalog";
import type { ScrollBundle } from "../src/scrolls/bundle";

function fixture(): ScrollBundle {
  const d = createScroll("storyboard", 2, "workspace");
  const asset = (id: string): ScrollAsset => ({
    id,
    name: `${id}.png`,
    role: "panel",
    kind: "image",
    origin: "uploaded",
    file: { path: `media/${id}.png`, sha256: "a".repeat(64) },
  });
  d.assets = [
    asset("sheet"),
    {
      ...asset("crop"),
      derivedFrom: { assetId: "sheet", box: [0, 0, 500, 500] },
    },
    asset("other"),
  ];
  d.sheetAssetId = "sheet";
  d.selectedIds = ["sheet", "crop", "other"];
  d.prompt = "A rooftop escape";
  d.cells[0] = {
    ...d.cells[0],
    assetId: "crop",
    region: { assetId: "sheet", box: [0, 0, 500, 500] },
    camera: "Track right",
    action: "Jump",
  };
  d.cells[1].title = "An authored final shot";
  return {
    document: parseScroll(d),
    files: new Map(
      d.assets.map((a) => [a.file.path, new Uint8Array([1, 2, 3])]),
    ),
  };
}

describe("Scrolls workspace edits", () => {
  it("changes sheet type without losing the loaded image, cells, timing or bytes", () => {
    const b = fixture(),
      next = changeScrollKind(b, "character");
    expect(next.document.kind).toBe("character");
    expect(next.document.assets).toEqual(b.document.assets);
    expect(next.document.sheetAssetId).toBe("sheet");
    expect(next.document.selectedIds).toEqual(b.document.selectedIds);
    expect(next.document.prompt).toBe(b.document.prompt);
    expect(next.document.cells[0]).toEqual({
      ...b.document.cells[0],
      title: "Front view",
    });
    expect(next.document.cells[1].title).toBe("An authored final shot");
    expect(next.document.timing).toEqual(b.document.timing);
    expect(next.files).toBe(b.files);
    expect(changeScrollKind(next, "storyboard").document.cells).toEqual(
      b.document.cells,
    );
    expect(b.document.kind).toBe("storyboard");
  });

  it("removes the displayed image and derived frames without leaving dangling references", () => {
    const b = fixture();
    expect([...removalIds(b, "sheet")]).toEqual(["sheet", "crop"]);
    const next = removeScrollAsset(b, "sheet");
    expect(next.document.assets.map((a) => a.id)).toEqual(["other"]);
    expect([...next.files.keys()]).toEqual(["media/other.png"]);
    expect(next.document.sheetAssetId).toBeUndefined();
    expect(next.document.selectedIds).toEqual(["other"]);
    expect(next.document.cells[0].assetId).toBeUndefined();
    expect(next.document.cells[0].region).toBeUndefined();
    expect(next.document.cells[0].camera).toBe("Track right");
    expect(next.document.cells[0].action).toBe("Jump");
    expect(next.document.cells[0].durationFrames).toBe(60);
    expect(b.document.assets).toHaveLength(3);
    expect(() => removeScrollAsset(b, "unknown")).toThrow(/not found/);
  });

  it("sends one prompt-only image request without silently adding the cell plan", () => {
    const d = fixture().document;
    const plain = imageInput(d, undefined, false);
    expect(plain.generator).toBe("image");
    expect(plain.description).toContain("as a single image");
    expect(plain.description).toContain(d.prompt);
    expect(plain.description).not.toContain("Track right");
    expect(imageInput(d, undefined, true).description).toContain(
      "Camera intention: Track right",
    );
    expect(imageInput(d, "cell-1", false).description).toContain(
      "Character action: Jump",
    );
    expect(() => imageInput(createScroll(), undefined, false)).toThrow(
      /Describe your sheet/,
    );
  });

  it("keeps all six examples and adds the Rooftop Escape and Four Rooms plans", () => {
    expect(scrollExamples).toHaveLength(8);
    expect(scrollExamples.at(-1)?.capture).toBe(true);
    const rooftop = scrollExamples.find(
      (e) => e.file === "rooftop-escape.png",
    )!;
    expect(rooftop.plan?.shots).toHaveLength(8);
    expect(rooftop.plan?.shots[3]).toEqual(["Evade", "Low pan", "Duck / kick"]);
    expect(rooftop.plan?.shots[7]).toEqual(["Escape", "Pull back", "Exit"]);
  });
});
