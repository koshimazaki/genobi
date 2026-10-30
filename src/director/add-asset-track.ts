import type { Bundle } from "./bundle";
import type { Layer } from "../../shared/director/types";
import { aliasAsset } from "../../shared/director/assets";
import { validateProject } from "./validate";
/** Reuse catalogued bytes. A reference gets a production alias, never a new upload. */
export function addAssetTrack(
  bundle: Bundle,
  assetId: string,
  frame: number,
  imageFrames: number,
): Bundle {
  const p = structuredClone(bundle.project),
    source = p.assets[assetId];
  if (!source) throw new Error("Choose an existing project asset.");
  const start = Math.max(0, Math.min(p.composition.durationFrames - 1, frame));
  const duration =
    source.kind === "image"
      ? imageFrames
      : Math.floor((source.durationSeconds ?? 0) * p.composition.fps);
  if (duration < 1) throw new Error("This asset has no usable media duration.");
  const id =
    source.use === "production"
      ? assetId
      : aliasAsset(p, assetId, "production", `asset-${crypto.randomUUID()}`);
  const base = {
    id: `layer-${crypto.randomUUID().slice(0, 8)}`,
    name: source.file.path.split("/").at(-1)!.slice(0, 120),
    kind: source.kind,
    startFrame: start,
    durationFrames: Math.min(duration, p.composition.durationFrames - start),
    locked: false,
    assetId: id,
  };
  const layer = {
    ...base,
    ...(source.kind === "audio"
      ? { sourceStartFrame: 0, gain: 1 }
      : {
          fit: "contain",
          opacity: 1,
          position: { x: 0, y: 0 },
          scale: 1,
          rotationDegrees: 0,
          ...(source.kind === "video" ? { sourceStartFrame: 0 } : {}),
        }),
  } as Layer;
  const graphic = p.layers.findIndex(
    (l) => l.kind === "graphics" || l.kind === "filter",
  );
  p.layers.splice(graphic < 0 ? p.layers.length : graphic, 0, layer);
  p.revision++;
  validateProject(p);
  return { project: p, files: bundle.files };
}
