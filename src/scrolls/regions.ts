import {
  parseRegion,
  type ScrollDocument,
  type ScrollCell,
} from "../../shared/scrolls/types";
import { imagePrompt, type ImageRegion } from "../image-regions";
import { addFile, assetType, type ScrollBundle } from "./bundle";
import { applyScrollCommand } from "../../shared/scrolls/commands";

export function editDraft(d: ScrollDocument, cell: ScrollCell) {
  if (!cell.region || cell.region.assetId !== d.sheetAssetId)
    throw new Error("Map this cell on the displayed sheet first.");
  const source = d.assets.find((a) => a.id === cell.region!.assetId);
  if (!source || source.kind !== "image")
    throw new Error("The region source is missing.");
  const region: ImageRegion = {
    id: `cell_${d.cells.indexOf(cell) + 1}`,
    box: parseRegion(cell.region).box,
    action: "change",
    description: cell.prompt || cell.title,
  };
  const description = [
    "Preserve the sheet layout and character identity.",
    cell.prompt,
    cell.camera && `Camera: ${cell.camera}.`,
    cell.action && `Action: ${cell.action}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    description,
    format: "genobi.scrolls-edit-draft.v1",
    documentId: d.id,
    revision: d.revision,
    cellId: cell.id,
    source: { id: source.id, file: source.file },
    region,
    prompt: imagePrompt(description, [region], true),
    requiresApproval: true,
    capability: "FLUX 3 Edit; open Klein editing unavailable",
  };
}
/** Explicit extraction only: no inferred grid, and no crop on selection. */
export async function extractRegion(
  bundle: ScrollBundle,
  cell: ScrollCell,
): Promise<ScrollBundle> {
  const draft = editDraft(bundle.document, cell),
    source = bundle.document.assets.find((a) => a.id === draft.source.id)!;
  const bitmap = await createImageBitmap(
    new Blob([bundle.files.get(source.file.path)!], {
      type: assetType(source),
    }),
  );
  try {
    const [t, l, b, r] = draft.region.box;
    const x = Math.floor((l * bitmap.width) / 1000),
      y = Math.floor((t * bitmap.height) / 1000),
      right = Math.ceil((r * bitmap.width) / 1000),
      bottom = Math.ceil((b * bitmap.height) / 1000);
    const canvas = document.createElement("canvas");
    canvas.width = right - x;
    canvas.height = bottom - y;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image extraction is unavailable.");
    ctx.drawImage(
      bitmap,
      x,
      y,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error("Could not extract the selected region.")),
        "image/png",
      ),
    );
    let next = await addFile(
      bundle,
      new File([blob], `${cell.title || cell.id}-region.png`, {
        type: "image/png",
      }),
      "panel",
      cell.id,
    );
    const asset = next.document.assets.at(-1)!;
    asset.derivedFrom = cell.region;
    next = {
      ...next,
      document: applyScrollCommand(next.document, {
        op: "cell",
        revision: next.document.revision,
        cell: { ...cell, assetId: asset.id },
      }),
    };
    return next;
  } finally {
    bitmap.close();
  }
}
