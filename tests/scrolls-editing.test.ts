import { readFileSync } from "node:fs";
import { addFile } from "../src/scrolls/bundle";
import { scrollsTools } from "../mcp/scrolls-tools";
import { describe, expect, it, vi } from "vitest";
import {
  applyScrollCommand,
  createScroll,
  fitToBeats,
  orderedSelection,
  timedCells,
} from "../shared/scrolls/commands";
import { parseScroll, type ScrollAsset } from "../shared/scrolls/types";
import {
  audioInterval,
  retimeCell,
  scrollDuration,
  sourceSample,
} from "../shared/scrolls/timing";
import { scrollHandoff } from "../shared/scrolls/prompts";
import { editDraft, extractRegion } from "../src/scrolls/regions";
import { directorBundle } from "../src/scrolls/director";
const sheet: ScrollAsset = {
  id: "sheet",
  name: "Whole sheet",
  role: "style",
  kind: "image",
  origin: "uploaded",
  file: { path: "media/sheet.png", sha256: "a".repeat(64) },
};
function fixture() {
  const d = createScroll("character", 3, "editing");
  d.assets = [sheet];
  d.sheetAssetId = sheet.id;
  d.cells[0].region = { assetId: sheet.id, box: [100, 200, 500, 600] };
  d.cells[0].prompt = "Restore the left pincer; preserve the right hand";
  return parseScroll(d);
}
describe("whole sheet and manual regions", () => {
  it("keeps displayed source separate from accepted selection and preserves older v1 documents", () => {
    const d = fixture();
    expect(parseScroll(d).sheetAssetId).toBe("sheet");
    expect(d.selectedIds).toEqual([]);
    const old = createScroll();
    expect(parseScroll(old).sheetAssetId).toBeUndefined();
    const selected = applyScrollCommand(d, {
      op: "select",
      revision: 0,
      ids: ["sheet"],
    });
    expect(selected.sheetAssetId).toBe("sheet");
    expect(selected.cells[0].assetId).toBeUndefined();
  });
  it("rejects missing sources, reversed or fractional bounds, and deleting mapped cells", () => {
    const d = fixture();
    for (const box of [
      [500, 200, 100, 600],
      [100.1, 200, 500, 600],
      [0, 0, 1001, 1000],
      [0, 0, 5, 5],
    ]) {
      expect(() =>
        parseScroll({
          ...d,
          cells: [
            { ...d.cells[0], region: { assetId: "sheet", box } },
            ...d.cells.slice(1),
          ],
        }),
      ).toThrow();
    }
    expect(() => parseScroll({ ...d, sheetAssetId: "missing" })).toThrow();
    d.cells[2].region = d.cells[0].region;
    expect(() =>
      applyScrollCommand(d, { op: "resize", revision: 0, count: 2 }),
    ).toThrow(/populated/);
  });
  it("prepares a source-bound explicit FLUX edit draft without generation or fallback", () => {
    const d = fixture(),
      before = JSON.stringify(d),
      draft = editDraft(d, d.cells[0]);
    expect(draft.source.file).toEqual(sheet.file);
    expect(draft.region.box).toEqual([100, 200, 500, 600]);
    expect(draft.prompt).toContain("left pincer");
    expect(draft.capability).toContain("open Klein editing unavailable");
    expect(draft.requiresApproval).toBe(true);
    expect(JSON.stringify(d)).toBe(before);
    expect(() =>
      editDraft({ ...d, sheetAssetId: undefined }, d.cells[0]),
    ).toThrow(/displayed sheet/);
  });
});
describe("linked frame timing", () => {
  it("moves and ripples an interval while preserving camera/action and chronological handoff", () => {
    const d = fixture();
    d.cells[0].camera = "Track left";
    d.cells[0].action = "Kick";
    const next = retimeCell(d, "cell-1", "move", 80, "frame");
    expect(next.revision).toBe(1);
    expect(timedCells(next).map((c) => c.startFrame)).toEqual([80, 140, 200]);
    expect(next.cells[0]).toMatchObject({
      camera: "Track left",
      action: "Kick",
      durationFrames: 60,
    });
    const reordered = retimeCell(d, "cell-3", "move", 0, "frame");
    expect(
      scrollHandoff(
        { ...reordered, selectedIds: ["sheet"] },
        "agent",
      ).cells.map((c) => c.id),
    ).toEqual(["cell-3", "cell-1", "cell-2"]);
    const grown = applyScrollCommand(reordered, {
      op: "resize",
      revision: 1,
      count: 4,
    });
    expect(grown.cells[3].startFrame).toBe(scrollDuration(reordered));
  });
  it("snaps to actual beat phase, preserves durations on tempo edits, and keeps integer boundaries", () => {
    const d = fixture();
    d.timing = { ...d.timing, bpm: 137, beatOffsetSeconds: 0.2 };
    const fitted = fitToBeats(d, 4),
      cuts = timedCells(fitted);
    expect(cuts[0].startFrame).toBe(5);
    expect(
      cuts.every(
        (c) =>
          Number.isInteger(c.startFrame) && Number.isInteger(c.durationFrames),
      ),
    ).toBe(true);
    const moved = retimeCell(d, "cell-1", "move", 16, "beat");
    expect(moved.cells[0].startFrame).toBe(Math.round(4.8 + (24 * 60) / 137));
    const tempo = applyScrollCommand(moved, {
      op: "timing",
      revision: 1,
      timing: { bpm: 160 },
    });
    expect(tempo.cells).toEqual(moved.cells);
    expect(() => retimeCell(d, "cell-1", "move", 24 * 120, "frame")).toThrow();
    expect(() => retimeCell(d, "cell-1", "move", NaN, "frame")).toThrow();
  });
  it("maps audio offsets and measured sample rates identically in preview and Director", () => {
    const d = fixture();
    d.assets.push({
      id: "music",
      name: "Music",
      role: "audio",
      kind: "audio",
      origin: "uploaded",
      durationSeconds: 10,
      file: { path: "media/music.wav", sha256: "b".repeat(64) },
    });
    d.timing = {
      ...d.timing,
      enabled: true,
      audioId: "music",
      audioStartFrame: 24,
      sourceStartFrame: 48,
      beatOffsetSeconds: 0.5,
    };
    expect(audioInterval(d)).toEqual({
      startFrame: 24,
      sourceStartFrame: 48,
      durationFrames: 156,
    });
    expect(sourceSample(48, d, undefined)).toBeUndefined();
    expect(sourceSample(23, d, 48000)).toBeUndefined();
    expect(sourceSample(48, d, 48000)).toBe(144000);
    const p = directorBundle({ document: d, files: new Map() }, true).project;
    expect(p.composition.beatOffsetSeconds).toBe(0.5);
    expect(p.layers.find((l) => l.kind === "audio")).toMatchObject(
      audioInterval(d)!,
    );
    expect(() =>
      parseScroll({ ...d, timing: { ...d.timing, sourceStartFrame: 240 } }),
    ).toThrow();
  });
  it("supports optional timed panel frames in character sheets without showing character references", () => {
    const d = fixture();
    d.timing.enabled = true;
    const panel = {
      ...sheet,
      id: "panel",
      role: "panel" as const,
      file: { ...sheet.file, path: "media/panel.png" },
    };
    d.assets.push(panel);
    d.cells[1].assetId = "panel";
    d.selectedIds = ["sheet", "panel"];
    expect(orderedSelection(d)[0].id).toBe("panel");
    const p = directorBundle({ document: d, files: new Map() }).project;
    expect(p.assets.sheet.use).toBe("reference");
    expect(p.layers).toHaveLength(1);
    expect(p.layers[0].startFrame).toBe(60);
  });
});

describe("explicit crop and agent operations", () => {
  it("extracts only reviewed bounds, retaining source lineage without accepting the crop", async () => {
    const png = readFileSync("public/scrolls/creature.png");
    const bundle = await addFile(
      { document: createScroll("character", 1), files: new Map() },
      new File([png], "source.png"),
      "character",
    );
    const source = bundle.document.assets[0];
    bundle.document.sheetAssetId = source.id;
    bundle.document.cells[0].region = {
      assetId: source.id,
      box: [100, 200, 500, 600],
    };
    const drawImage = vi.fn(),
      close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 1000, height: 500, close })),
    );
    vi.stubGlobal("document", {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (callback: (b: Blob) => void) =>
          callback(new Blob([png], { type: "image/png" })),
      }),
    });
    try {
      const next = await extractRegion(bundle, bundle.document.cells[0]);
      expect(drawImage.mock.calls[0].slice(1)).toEqual([
        200, 50, 400, 200, 0, 0, 400, 200,
      ]);
      expect(next.document.assets.at(-1)?.derivedFrom).toEqual(
        bundle.document.cells[0].region,
      );
      expect(next.document.selectedIds).toEqual([]);
      expect(next.document.cells[0].assetId).toBe(
        next.document.assets.at(-1)?.id,
      );
      expect(bundle.document.assets).toHaveLength(1);
      expect(close).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("rejects cyclic crop lineage and applies the same revision-bound retiming via MCP", async () => {
    const d = fixture();
    d.assets.push({
      ...sheet,
      id: "other",
      file: { ...sheet.file, path: "media/other.png" },
      derivedFrom: { assetId: "sheet", box: [0, 0, 500, 500] },
    });
    d.assets[0] = {
      ...d.assets[0],
      derivedFrom: { assetId: "other", box: [0, 0, 500, 500] },
    };
    expect(() => parseScroll(d)).toThrow(/cycle/);
    const tool = scrollsTools[0],
      api = {} as Parameters<typeof tool.run>[0];
    const doc = fixture();
    await expect(
      tool.run(api, {
        action: "retime",
        document: doc,
        revision: 9,
        cellId: "cell-1",
        frame: 12,
      }),
    ).rejects.toThrow(/revision/);
    const next = await tool.run(api, {
      action: "retime",
      document: doc,
      revision: 0,
      cellId: "cell-1",
      frame: 12,
      mode: "move",
      snap: "frame",
    });
    expect(next).toEqual(retimeCell(doc, "cell-1", "move", 12, "frame"));
  });
});
