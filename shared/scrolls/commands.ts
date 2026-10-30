import {
  fail,
  id,
  integer,
  object,
  parseAsset,
  parseCell,
  parseScroll,
  SCROLLS_FORMAT,
  text,
  type ScrollDocument,
  type ScrollKind,
} from "./types";

const characterViews = [
  "Front view",
  "Profile",
  "Back view",
  "Three-quarter view",
  "High kick",
  "Attack pose",
  "Jump",
  "Expression study",
];
const shots = [
  "Establish the scene",
  "Approach",
  "First encounter",
  "Counter move",
  "Pursuit",
  "Obstacle",
  "Escape",
  "Final reveal",
];
export function createScroll(
  kind: ScrollKind = "storyboard",
  count = 8,
  documentId = "scroll",
) {
  integer(count, 1, 16);
  const names = kind === "character" ? characterViews : shots;
  return parseScroll({
    format: SCROLLS_FORMAT,
    id: id(documentId),
    revision: 0,
    kind,
    name: kind === "character" ? "Character study" : "Untitled storyboard",
    prompt: "",
    cells: Array.from({ length: count }, (_, i) => ({
      id: `cell-${i + 1}`,
      title: names[i] ?? `Panel ${i + 1}`,
      prompt: "",
      camera: "",
      action: "",
      durationFrames: 60,
    })),
    assets: [],
    selectedIds: [],
    timing: { enabled: false, fps: 24, bpm: 120 },
  });
}
/** Pure, revision-checked edits shared by the browser and MCP. No operation generates. */
export function applyScrollCommand(
  document: ScrollDocument,
  value: unknown,
): ScrollDocument {
  const c = object(value, [
    "op",
    "revision",
    "prompt",
    "name",
    "cell",
    "asset",
    "ids",
    "timing",
    "count",
    "sheetAssetId",
    "script",
  ]);
  if (c.revision !== document.revision)
    fail("Scroll changed; read its current revision before editing.");
  const next = structuredClone(parseScroll(document));
  const fields: Record<string, string[]> = {
    brief: ["prompt", "name", "sheetAssetId", "script"],
    cell: ["cell"],
    "add-asset": ["asset"],
    select: ["ids"],
    timing: ["timing"],
    resize: ["count"],
  };
  if (
    typeof c.op !== "string" ||
    !Object.hasOwn(fields, c.op) ||
    Object.keys(c).some(
      (k) => !["op", "revision", ...fields[c.op as string]].includes(k),
    )
  )
    fail("Unknown Scrolls command or unexpected field.");
  switch (c.op) {
    case "brief":
      if (c.sheetAssetId !== undefined) next.sheetAssetId = id(c.sheetAssetId);
      if (c.prompt !== undefined) next.prompt = text(c.prompt, 4000);
      if (c.name !== undefined) next.name = text(c.name, 120);
      if (c.script !== undefined) next.script = text(c.script, 4000);
      break;
    case "cell": {
      const cell = parseCell(c.cell),
        index = next.cells.findIndex((x) => x.id === cell.id);
      if (index < 0) fail("Cell not found.");
      next.cells[index] = cell;
      break;
    }
    case "add-asset": {
      const asset = parseAsset(c.asset);
      if (next.assets.some((a) => a.id === asset.id))
        fail("Asset already exists.");
      next.assets.push(asset);
      break;
    }
    case "select":
      if (!Array.isArray(c.ids)) fail("Select asset IDs.");
      next.selectedIds = (c.ids as unknown[]).map(id);
      break;
    case "timing":
      next.timing = {
        ...next.timing,
        ...object(c.timing, [
          "enabled",
          "fps",
          "bpm",
          "audioId",
          "beatOffsetSeconds",
          "audioStartFrame",
          "sourceStartFrame",
        ]),
      };
      break;
    case "resize": {
      const count = integer(c.count, 1, 16);
      if (
        next.cells
          .slice(count)
          .some(
            (cell) =>
              cell.assetId ||
              cell.region ||
              cell.prompt ||
              cell.camera ||
              cell.action ||
              next.assets.some((a) => a.cellId === cell.id),
          )
      )
        fail(
          "Cannot remove populated cells. Keep or export this board before starting another.",
        );
      const defaults = createScroll(next.kind, count).cells;
      let end = Math.max(
        ...timedCells(next).map((c) => c.startFrame + c.durationFrames),
      );
      next.cells = defaults.map((cell, i) => {
        if (next.cells[i]) return next.cells[i];
        const added = { ...cell, startFrame: end };
        end += cell.durationFrames;
        return added;
      });
      break;
    }
  }
  next.revision++;
  return parseScroll(next);
}
export function orderedSelection(doc: ScrollDocument) {
  const orderedCells = timedCells(doc).sort(
    (a, b) => a.startFrame - b.startFrame,
  );
  const rank = (assetId: string) => {
    const a = doc.assets.find((a) => a.id === assetId)!;
    const index = orderedCells.findIndex(
      (c) => c.id === a.cellId || c.assetId === assetId,
    );
    return index < 0 ? doc.cells.length : index;
  };
  return doc.assets
    .filter((a) => doc.selectedIds.includes(a.id))
    .sort((a, b) => rank(a.id) - rank(b.id));
}
export function timedCells(doc: ScrollDocument) {
  let startFrame = 0;
  return doc.cells.map((cell) => {
    const timed = { ...cell, startFrame: cell.startFrame ?? startFrame };
    startFrame = timed.startFrame + cell.durationFrames;
    return timed;
  });
}
/** Explicit retiming: BPM changes by themselves never alter accepted cuts. */
export function fitToBeats(doc: ScrollDocument, beatsPerCell: number) {
  integer(beatsPerCell, 1, 16);
  const step = (beatsPerCell * 60 * doc.timing.fps) / doc.timing.bpm;
  return parseScroll({
    ...doc,
    revision: doc.revision + 1,
    cells: doc.cells.map((c, i) => ({
      ...c,
      startFrame: Math.round(
        (doc.timing.beatOffsetSeconds ?? 0) * doc.timing.fps + i * step,
      ),
      durationFrames: Math.max(
        1,
        Math.round(
          (doc.timing.beatOffsetSeconds ?? 0) * doc.timing.fps + (i + 1) * step,
        ) -
          Math.round(
            (doc.timing.beatOffsetSeconds ?? 0) * doc.timing.fps + i * step,
          ),
      ),
    })),
  });
}
