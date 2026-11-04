import type { Project } from "../../shared/director/types";
import { linkedClip, rangeLabel, sourceRange } from "../director/clip-source";

/** The role an Inspirations card shows. Display only: no behaviour hangs on it. */
export const REFERENCE_MARK = "Reference · style";

/**
 * The facts a project-asset card shows, shared by the rail's shelf and the
 * expanded gallery so both say the same thing: "Used · <track>" or "Not
 * placed" for production media, and the clip's source span for timed media.
 */
export function assetFacts(project: Project, id: string, selected: string) {
  const asset = project.assets[id]!;
  const inspiration = asset.use === "reference";
  const clip = linkedClip(project, id, selected);
  const layer = project.layers.find((l) => "assetId" in l && l.assetId === id);
  const range = clip && sourceRange(clip, asset, project.composition.fps);
  const name = asset.file.path.split("/").at(-1) ?? "";
  const meta =
    [
      !inspiration && (layer ? `Used · ${layer.name}` : "Not placed"),
      asset.kind !== "image" && range && rangeLabel(range),
    ]
      .filter(Boolean)
      .join(" · ") || (asset.kind !== "image" ? "Not placed" : "");
  return { asset, name, layer, range, meta, inspiration };
}
