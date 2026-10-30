import { createScroll } from "../../shared/scrolls/commands";
import { parseScroll, type ScrollKind } from "../../shared/scrolls/types";
import type { ScrollBundle } from "./bundle";

/** Changing the sheet's purpose keeps imported media, timing and authored edits. */
export function changeScrollKind(
  bundle: ScrollBundle,
  kind: ScrollKind,
): ScrollBundle {
  const d = bundle.document,
    defaults = createScroll(d.kind, d.cells.length),
    next = createScroll(kind, d.cells.length);
  return {
    ...bundle,
    document: parseScroll({
      ...d,
      kind,
      revision: d.revision + 1,
      name: d.name === defaults.name ? next.name : d.name,
      cells: d.cells.map((c, i) => ({
        ...c,
        title:
          c.title === defaults.cells[i].title ? next.cells[i].title : c.title,
      })),
    }),
  };
}

export function removalIds(bundle: ScrollBundle, assetId: string): Set<string> {
  if (!bundle.document.assets.some((a) => a.id === assetId))
    throw new Error("Asset not found.");
  const ids = new Set([assetId]);
  for (let size = 0; size !== ids.size;) {
    size = ids.size;
    for (const a of bundle.document.assets)
      if (a.derivedFrom && ids.has(a.derivedFrom.assetId)) ids.add(a.id);
  }
  return ids;
}

/** Remove bytes and every dependent reference, while keeping the cell plan. */
export function removeScrollAsset(
  bundle: ScrollBundle,
  assetId: string,
): ScrollBundle {
  const ids = removalIds(bundle, assetId),
    d = bundle.document;
  const document = parseScroll({
    ...d,
    revision: d.revision + 1,
    assets: d.assets.filter((a) => !ids.has(a.id)),
    selectedIds: d.selectedIds.filter((id) => !ids.has(id)),
    sheetAssetId:
      d.sheetAssetId && !ids.has(d.sheetAssetId) ? d.sheetAssetId : undefined,
    timing: {
      ...d.timing,
      audioId:
        d.timing.audioId && !ids.has(d.timing.audioId)
          ? d.timing.audioId
          : undefined,
    },
    cells: d.cells.map((c) => ({
      ...c,
      assetId: c.assetId && !ids.has(c.assetId) ? c.assetId : undefined,
      region: c.region && !ids.has(c.region.assetId) ? c.region : undefined,
    })),
  });
  const paths = new Set(document.assets.map((a) => a.file.path));
  return {
    document,
    files: new Map([...bundle.files].filter(([path]) => paths.has(path))),
  };
}
