import type { ScrollAsset, ScrollDocument } from "./types";

/**
 * A panel frame: an uploaded style image tied to one storyboard panel, such as
 * that panel's World Builder first frame. A run for that panel (Fill panels or
 * the panel's own Generate) sends it as the panel's own reference, ahead of
 * the board's **Like these** references, so each panel is drawn from its own
 * 3D blocking. A generated candidate for a panel is not a frame: only
 * uploaded style images count, and nothing is inferred from a sheet.
 */
export function panelFrames(
  doc: Pick<ScrollDocument, "assets">,
  cellId: string | undefined,
  /** Content hashes already sent as board references, so none is sent twice. */
  exclude: readonly string[] = [],
): ScrollAsset[] {
  if (!cellId) return [];
  return doc.assets.filter(
    (a) =>
      a.cellId === cellId &&
      a.role === "style" &&
      a.kind === "image" &&
      a.origin === "uploaded" &&
      !exclude.includes(a.file.sha256),
  );
}

/**
 * The words for a panel's own frames, which come first among the images:
 * keep the frame's camera, framing, character placement and pose, and the
 * set's layout, and redraw its stand-in shapes as the panel describes.
 */
export function frameClause(count: number) {
  if (!count) return "";
  const which = count === 1 ? "Reference 1 is" : `References 1–${count} are`;
  return [
    `${which} this panel's 3D blocking frame${count === 1 ? "" : "s"} from World Builder.`,
    "Keep its camera angle, lens and framing, the character's position and pose, and the layout of the set.",
    "The grey shapes and mannequin are stand-ins: redraw them as the finished frame described below.",
  ].join("\n");
}
