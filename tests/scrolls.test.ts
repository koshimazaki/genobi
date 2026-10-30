import { describe, expect, it } from "vitest";
import {
  createScroll,
  applyScrollCommand,
  fitToBeats,
  timedCells,
} from "../shared/scrolls/commands";
import { parseScroll, type ScrollAsset } from "../shared/scrolls/types";
import { imageInput, scrollHandoff } from "../shared/scrolls/prompts";
import { directorBundle, openInDirector } from "../src/scrolls/director";
import { readBrief } from "../src/director/prompt-brief";
import { studioStore } from "../src/studio/store";
import { validateProject } from "../src/director/validate";
import {
  addFile,
  openScroll,
  validateScrollFiles,
} from "../src/scrolls/bundle";
import { zipSync, strToU8 } from "fflate";
import { readFileSync } from "node:fs";

const image = (
  id: string,
  role: ScrollAsset["role"] = "panel",
): ScrollAsset => ({
  id,
  name: id,
  role,
  kind: "image",
  origin: "uploaded",
  file: { path: `media/${id}.png`, sha256: "a".repeat(64) },
});
function fixture() {
  const d = createScroll("storyboard", 2, "test-scroll");
  d.prompt = "Two ninjas escape across the rooftops.";
  d.cells[0] = {
    ...d.cells[0],
    prompt: "Leap across the alley",
    camera: "Track right",
    action: "Jump right",
    assetId: "panel-one",
  };
  d.assets = [
    image("hero", "character"),
    image("panel-one"),
    image("panel-two"),
  ];
  d.cells[1].assetId = "panel-two";
  d.selectedIds = ["panel-two", "hero", "panel-one"];
  return parseScroll(d);
}
describe("portable Scrolls contracts", () => {
  it("refuses stale agent writes, unrecognized fields, duplicate paths and dangling selections", () => {
    const d = fixture();
    expect(() =>
      applyScrollCommand(d, { op: "brief", revision: 5, prompt: "changed" }),
    ).toThrow(/revision/);
    expect(() =>
      applyScrollCommand(d, { op: "brief", revision: 0, secret: "no" }),
    ).toThrow();
    expect(() =>
      parseScroll({
        ...d,
        assets: [
          ...d.assets,
          { ...image("duplicate"), file: d.assets[0].file },
        ],
      }),
    ).toThrow(/Duplicate media/);
    expect(() => parseScroll({ ...d, selectedIds: ["unknown"] })).toThrow(
      /missing/,
    );
    expect(() =>
      parseScroll({
        ...d,
        assets: [
          {
            ...d.assets[0],
            file: { ...d.assets[0].file, path: "../escape.png" },
          },
        ],
      }),
    ).toThrow(/path/);
    // A name becomes a Director layer name: tabs and line breaks are refused too.
    for (const name of ["two\nlines", "tab\there", "nul\x00"])
      expect(() =>
        parseScroll({
          ...d,
          assets: [{ ...d.assets[0], name }, ...d.assets.slice(1)],
        }),
      ).toThrow(/control characters/);
  });
  it("requires a brief, defaults to open Klein and isolates a cell prompt", () => {
    expect(() => imageInput(createScroll())).toThrow(/Describe/);
    const input = imageInput(fixture(), "cell-1");
    expect(input.model).toBe("flux-3-klein");
    expect(input.description).toContain("Track right");
    expect(input.description).not.toContain("Approach");
  });
  it("preserves cut durations on tempo edits and quantizes boundaries without cumulative drift", () => {
    const d = fixture();
    const edited = applyScrollCommand(d, {
      op: "timing",
      revision: 0,
      timing: { enabled: true, bpm: 137 },
    });
    expect(edited.cells.map((c) => c.durationFrames)).toEqual([60, 60]);
    const fitted = fitToBeats(edited, 4),
      cuts = timedCells(fitted);
    expect(cuts[1].startFrame + cuts[1].durationFrames).toBe(
      Math.round((8 * 60 * 24) / 137),
    );
  });
  it("hands off stable shot order, keeps whole-sheet cell guidance, and omits unselected assignments", () => {
    const d = fixture(),
      handoff = scrollHandoff(d, "agent");
    expect(handoff.assets.map((a) => a.id)).toEqual([
      "panel-one",
      "panel-two",
      "hero",
    ]);
    d.selectedIds = ["hero"];
    const single = scrollHandoff(d, "video");
    expect(single.cells).toHaveLength(2);
    expect(single.cells[0].camera).toBe("Track right");
    expect(single.cells[0].assetId).toBeUndefined();
    expect(single.requiresApproval).toBe(true);
  });
  it("carries attached timing audio with explicit selection IDs", () => {
    const d = fixture();
    d.assets.push({
      id: "music",
      name: "Music",
      kind: "audio",
      role: "audio",
      origin: "uploaded",
      file: { path: "media/music.wav", sha256: "b".repeat(64) },
      durationSeconds: 10,
    });
    d.timing = { ...d.timing, enabled: true, audioId: "music" };
    const handoff = scrollHandoff(d, "director");
    expect(handoff.selectedIds).toEqual(d.selectedIds);
    expect(handoff.assets.at(-1)?.role).toBe("audio");
    const p = directorBundle({ document: d, files: new Map() }).project;
    validateProject(p);
    expect(p.layers.find((l) => l.kind === "audio")?.durationFrames).toBe(120);
  });
  it("keeps identity off timeline and maps accepted panels only when timing is enabled", () => {
    const d = fixture();
    expect(
      directorBundle({ document: d, files: new Map() }).project.layers,
    ).toEqual([]);
    d.timing.enabled = true;
    const { project } = directorBundle({ document: d, files: new Map() });
    validateProject(project);
    expect(project.assets.hero.use).toBe("reference");
    expect(project.layers.map((l) => l.id)).toEqual([
      "scroll-shot-1",
      "scroll-shot-2",
    ]);
    expect(project.notes?.[0].text).toContain("Camera: Track right");
    d.selectedIds = ["hero", "panel-two"];
    expect(
      directorBundle({ document: d, files: new Map() }).project.layers.map(
        (l) => l.id,
      ),
    ).toEqual(["scroll-shot-2"]);
  });
});
describe("bounded media bundles", () => {
  it("round-trips actual bytes and rejects a replaced image", async () => {
    const bytes = readFileSync("public/scrolls/creature.png");
    const b = await addFile(
      { document: createScroll(), files: new Map() },
      new File([bytes], "creature.png"),
      "character",
    );
    const zip = zipSync({
      "scroll.json": strToU8(JSON.stringify(b.document)),
      [b.document.assets[0].file.path]: b.files.get(
        b.document.assets[0].file.path,
      )!,
    });
    const restored = await openScroll(
      new File([new Uint8Array(zip)], "scroll.zip"),
    );
    expect(restored.document).toEqual(b.document);
    const altered = { ...restored, files: new Map(restored.files) };
    altered.files.set(
      b.document.assets[0].file.path,
      new Uint8Array([1, 2, 3]),
    );
    await expect(validateScrollFiles(altered)).rejects.toThrow(/changed media/);
  });
  it("imports untimed guidance with a verified placement receipt and protects the resulting draft", async () => {
    const bytes = readFileSync("public/scrolls/creature.png");
    const b = await addFile(
      {
        document: createScroll("storyboard", 2, "handoff-test"),
        files: new Map(),
      },
      new File([bytes], "sheet.png"),
      "panel",
    );
    b.document.prompt = "A creature escapes.";
    b.document.cells[0].camera = "Pan right";
    b.document.cells[0].action = "Leap across the gate";
    b.document.selectedIds = [b.document.assets[0].id];
    const receipt = await openInDirector(b);
    const director = studioStore.getState().director.bundle!;
    expect(receipt.destinationProjectId).toBe(director.project.id);
    expect(receipt.placements[0].layerIds).toEqual([]);
    expect(readBrief(director).text).toContain("Pan right");
    expect(readBrief(director).text).toContain("Leap across the gate");
    await expect(openInDirector(b)).rejects.toThrow(
      /already has a Director draft/,
    );
  });
  it("rejects traversal and unreferenced ZIP contents", async () => {
    const zipped = (files: Record<string, Uint8Array>) =>
      new File([new Uint8Array(zipSync(files))], "bad.zip");
    await expect(
      openScroll(zipped({ "../outside": new Uint8Array([1]) })),
    ).rejects.toThrow(/Unexpected file/);
    await expect(
      openScroll(
        zipped({
          "scroll.json": strToU8(JSON.stringify(createScroll())),
          "media/unreferenced.png": new Uint8Array([1]),
        }),
      ),
    ).rejects.toThrow(/unreferenced/);
  });
});
