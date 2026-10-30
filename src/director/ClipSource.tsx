import { useState } from "react";
import { studioStore } from "../studio/store";
import { executeStudioCommand } from "../studio/commands";
import { PROJECT_ASSET_DRAG, readAssetDrag } from "./asset-drag";
import type { Layer, Project } from "../../shared/director/types";
import { useStudio } from "../studio/useStudio";
import AssetThumbnail from "./AssetThumbnail";
import { durationLabel, pointLabel, sourceRange } from "./clip-source";

/**
 * The clip inspector's source card: which file the clip shows, its in and out
 * frames as posters, frames and seconds, and the unused handles either side.
 * Two posters at most, decoded only for the selected clip.
 */
export default function ClipSource({
  project,
  layer,
}: {
  project: Project;
  layer: Layer;
}) {
  const [error, setError] = useState("");
  const files = useStudio((s) => s.director.bundle?.files);
  const actions = useStudio((s) => s.actions);
  if (!("assetId" in layer)) return null;
  const asset = project.assets[layer.assetId];
  if (!asset) return null;
  const { fps } = project.composition;
  const range = sourceRange(layer, asset, fps);
  const bytes = files?.get(asset.file.path);
  const name = asset.file.path.split("/").at(-1);
  return (
    <section
      className="dir-source"
      aria-label="Source"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(PROJECT_ASSET_DRAG)) {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = layer.locked ? "none" : "copy";
        }
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(PROJECT_ASSET_DRAG)) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          const bundle = studioStore.getState().director.bundle;
          if (!bundle) return;
          const { assetId } = readAssetDrag(e.dataTransfer, bundle);
          void executeStudioCommand({
            op: "use-asset",
            revision: bundle.project.revision,
            assetId,
            layerIds: [layer.id],
          })
            .then(() => setError(""))
            .catch((error) => setError(String(error)));
        } catch (error) {
          setError(String(error));
        }
      }}
    >
      <p className="dir-source-drop-hint">
        Drop a project asset here to replace this source.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="dir-source-heading">
        <strong title={name}>{name}</strong>
        <button
          type="button"
          onClick={() =>
            actions.workspace({
              drawerOpen: true,
              assetRole: asset.use,
              assetSelection: layer.assetId,
              targetLayers: [],
            })
          }
        >
          Show in media
        </button>
      </div>
      {asset.kind === "video" && range && (
        <div className="dir-source-posters">
          {(
            [
              ["In", range.inSeconds],
              ["Out", range.outSeconds],
            ] as const
          ).map(([label, seconds]) => (
            <span key={label} className="dir-asset-frame">
              <AssetThumbnail asset={asset} bytes={bytes} seconds={seconds} />
              <span className="dir-asset-duration dir-source-mark">
                {label}
              </span>
            </span>
          ))}
        </div>
      )}
      {range ? (
        <dl>
          <dt>In</dt>
          <dd>{pointLabel(range.inFrame, fps)}</dd>
          <dt>Out</dt>
          <dd>{pointLabel(range.outFrame, fps)}</dd>
          {range.sourceFrames !== undefined && (
            <>
              <dt>Source</dt>
              <dd>
                {durationLabel(asset.durationSeconds!)} · {range.sourceFrames} f
              </dd>
              <dt>Handles</dt>
              <dd>
                head {range.head} f · tail {range.tail} f
              </dd>
            </>
          )}
        </dl>
      ) : (
        <dl>
          <dt>Source</dt>
          <dd>{asset.kind} · held for the clip</dd>
        </dl>
      )}
    </section>
  );
}
