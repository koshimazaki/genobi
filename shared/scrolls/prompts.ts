import type { GenerateInput } from "../types";
import { fail, PROMPT_LIMIT, type ScrollDocument } from "./types";
import { orderedSelection, timedCells } from "./commands";

/** "(2.0–4.0 s)": when a timed cell happens, as the timeline shows it. */
function when(doc: ScrollDocument, cellId: string) {
  if (!doc.timing.enabled) return "";
  const c = timedCells(doc).find((t) => t.id === cellId)!,
    s = (frames: number) => (frames / doc.timing.fps).toFixed(1);
  return ` (${s(c.startFrame)}–${s(c.startFrame + c.durationFrames)} s)`;
}
export function scrollPrompt(doc: ScrollDocument, cellId?: string) {
  const cells = cellId ? doc.cells.filter((c) => c.id === cellId) : doc.cells;
  if (!cells.length) fail("Cell not found.");
  const intro = cellId
    ? `One clean ${doc.kind === "character" ? "character reference" : "storyboard frame"}.`
    : `One ${doc.kind === "character" ? "character sheet" : "storyboard contact sheet"}, exactly ${cells.length} clearly separated panels, ordered left to right, top to bottom.`;
  const prompt = [
    intro,
    doc.prompt.trim(),
    ...cells.map((c, i) =>
      [
        `${i + 1}. ${c.title}${when(doc, c.id)}: ${c.prompt}`,
        `Camera intention: ${c.camera || "Locked"}.`,
        `Character action: ${c.action || "Hold"}.`,
      ]
        .filter(Boolean)
        .join(" "),
    ),
    "Keep identity and visual style consistent. No captions, letters, watermarks or UI inside the image.",
  ]
    .filter(Boolean)
    .join("\n");
  if (!doc.prompt.trim() && !cells.some((c) => c.prompt.trim()))
    fail("Describe your idea or write a cell prompt first.");
  if (prompt.length > PROMPT_LIMIT)
    fail(
      "The combined prompt exceeds 4,000 characters. Shorten it or generate individual cells.",
    );
  return prompt;
}
/** A prompt-only sheet stays one image; it does not invent a cell plan. */
export function sheetPrompt(doc: ScrollDocument): string {
  const brief = doc.prompt.trim();
  if (!brief) fail("Describe your sheet first.");
  const prompt = `Create one ${doc.kind === "character" ? "character sheet" : "storyboard sheet"} as a single image.\n${brief}`;
  if (prompt.length > PROMPT_LIMIT)
    fail(
      "The combined prompt exceeds 4,000 characters. Shorten the sheet brief.",
    );
  return prompt;
}
export function imageInput(
  doc: ScrollDocument,
  cellId?: string,
  includePlan = true,
): GenerateInput {
  return {
    generator: "image",
    model: "flux-3-klein",
    description:
      cellId || includePlan ? scrollPrompt(doc, cellId) : sheetPrompt(doc),
    imageAspectRatio: "16:9",
    imageResolution: "1k",
    cameraEnabled: false,
    duration: 6,
    resolution: "fhd",
    aspectRatio: "16:9",
    draft: false,
    upscaleFactor: 2,
    upscaleCreativity: 0,
  };
}
/** A portable agent handoff, not a model request or permission to spend. */
export function scrollHandoff(
  doc: ScrollDocument,
  destination: "agent" | "video" | "director",
) {
  const assets = orderedSelection(doc);
  if (!assets.length) fail("Select results to use first.");
  const audio =
    doc.timing.enabled && doc.assets.find((a) => a.id === doc.timing.audioId);
  if (audio && !assets.some((a) => a.id === audio.id)) assets.push(audio);
  return {
    format: "genobi.scrolls-handoff.v1",
    documentId: doc.id,
    revision: doc.revision,
    destination,
    selectedIds: [...doc.selectedIds],
    prompt: doc.prompt,
    preferredVideoModel: "ltx-2.5",
    requiresApproval: true,
    assets: assets.map((a) => ({
      id: a.id,
      role: a.role,
      file: a.file,
      cellId: a.cellId ?? null,
    })),
    sheetAssetId: assets.some((a) => a.id === doc.sheetAssetId)
      ? doc.sheetAssetId
      : undefined,
    cells: timedCells(doc)
      .sort((a, b) => a.startFrame - b.startFrame)
      .map((c) => ({
        ...c,
        assetId: assets.some((a) => a.id === c.assetId) ? c.assetId : undefined,
      })),
    timing: doc.timing,
    guidance:
      "Selected images are creative guidance. Check the selected workflow's image/audio/video input capabilities before generation. Do not discard references or substitute a paid model silently.",
  };
}
