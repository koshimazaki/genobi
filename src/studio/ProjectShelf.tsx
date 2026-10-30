import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { assetUses } from "../../shared/director/assets";
import { executeStudioCommand } from "./commands";
import { studioStore } from "./store";
import { MediaDropZone } from "../director/MediaDropZone";
import { importProjectMedia } from "../director/import-project-media";
import { writeAssetDrag } from "../director/asset-drag";
import "./media-shelf.css";
import { useStudio } from "./useStudio";
import { useShell } from "./ShellContext";
import MediaTile from "../director/MediaTile";
import { stopPlayback } from "../director/media-playback";
import { findTemplate } from "../director/template-catalogue";
import {
  linkedAsset,
  linkedClip,
  rangeLabel,
  sourceRange,
} from "../director/clip-source";

export function ProjectShelf({ role }: { role: "production" | "reference" }) {
  const director = useShell()?.preset === "director";
  const bundle = useStudio((s) => s.director.bundle);
  const actions = useStudio((s) => s.actions);
  const selected = useStudio((s) => s.workspace.selected);
  const blocked = useStudio((s) => Object.values(s.operations).some(Boolean));
  const [removed, setRemoved] = useState<typeof bundle>(undefined);
  const [notice, setNotice] = useState("");
  // A hidden rail keeps its cards mounted: stop any sound it was playing.
  const railOpen = useShell()?.assetsOpen ?? true;
  useEffect(() => {
    if (!railOpen) stopPlayback();
  }, [railOpen]);
  if (!bundle) return null;
  const project = bundle.project;
  // The card of the selected clip's asset is marked, as the drawer marks it.
  const current = linkedAsset(project, selected);
  const entries = Object.entries(project.assets).filter(
    ([, asset]) => asset.use === role,
  );
  const inspiration = role === "reference";
  return (
    <div className="genobi-media-shelf">
      <div className="genobi-shelf-toolbar">
        <span>
          {entries.length} {entries.length === 1 ? "file" : "files"}
        </span>
        <button
          onClick={() =>
            actions.workspace({
              drawerOpen: true,
              assetRole: role,
              assetSelection: "",
              targetLayers: [],
            })
          }
        >
          Manage
        </button>
      </div>
      <MediaDropZone
        compact
        multiple
        disabled={blocked}
        label={inspiration ? "Drop inspirations" : "Drop project assets"}
        hint={
          inspiration ? "Style and sound references" : "Images, video or audio"
        }
        accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/*"
        onFiles={async (files) => {
          await importProjectMedia(files, role);
          setNotice(
            inspiration
              ? "Inspiration added. Drag it into the prompt."
              : "Media added to your project.",
          );
        }}
      />
      {notice && (
        <p className="genobi-shelf-notice" role="status">
          {notice}
          {removed && removed === bundle && (
            <button
              type="button"
              className="text-button"
              disabled={blocked}
              onClick={() => {
                if (studioStore.getState().director.bundle !== removed) return;
                actions.undo();
                setRemoved(undefined);
                setNotice("Removal undone.");
              }}
            >
              Undo
            </button>
          )}
        </p>
      )}
      <div className="genobi-project-assets">
        {entries.slice(0, 12).map(([id, asset]) => {
          const clip = linkedClip(project, id, selected);
          const layer = project.layers.find(
            (l) => "assetId" in l && l.assetId === id,
          );
          const slot = findTemplate(project.id)?.slots.find((slot) =>
            slot.layerIds.every((layerId) =>
              project.layers.some(
                (l) => l.id === layerId && "assetId" in l && l.assetId === id,
              ),
            ),
          );
          const range =
            clip && sourceRange(clip, asset, project.composition.fps);
          const uses = assetUses(project, id);
          const name = asset.file.path.split("/").at(-1);
          const meta =
            [
              !inspiration && (layer ? `Used · ${layer.name}` : "Not placed"),
              asset.kind !== "image" && range && rangeLabel(range),
            ]
              .filter(Boolean)
              .join(" · ") || (asset.kind !== "image" ? "Not placed" : "");
          return (
            <MediaTile
              key={id}
              className="genobi-project-asset"
              asset={asset}
              bytes={bundle.files.get(asset.file.path)}
              seconds={range?.inSeconds}
              name={name ?? ""}
            >
              {(frame) => (
                <>
                  <button
                    draggable={!blocked}
                    onDragStart={(event) => {
                      if (blocked) event.preventDefault();
                      else writeAssetDrag(event.dataTransfer, bundle, id);
                    }}
                    aria-current={id === current ? "true" : undefined}
                    onClick={() =>
                      actions.workspace({
                        drawerOpen: true,
                        assetRole: role,
                        assetSelection: id,
                        targetLayers: director
                          ? [...(slot?.layerIds ?? (layer ? [layer.id] : []))]
                          : [],
                      })
                    }
                    title={asset.file.path}
                  >
                    {frame}
                    <span className="genobi-asset-name">{name}</span>
                    {meta && (
                      <span className="genobi-asset-use" title={layer?.name}>
                        {meta}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="genobi-asset-remove"
                    aria-label={`Remove ${name} from project`}
                    title={
                      uses.length
                        ? `In use: ${uses.join(", ")}. Remove its uses first.`
                        : "Remove from project · original generation stays in the gallery"
                    }
                    disabled={blocked || uses.length > 0}
                    onClick={async () => {
                      setRemoved(undefined);
                      try {
                        const result = await executeStudioCommand({
                          op: "remove-asset",
                          revision: project.revision,
                          assetId: id,
                        });
                        setNotice(`Removed ${name} from project.`);
                        const after = studioStore.getState().director.bundle;
                        const next =
                          "bundle" in result ? result.bundle : undefined;
                        setRemoved(
                          next &&
                            after?.files === next.files &&
                            after.project.id === next.project.id &&
                            after.project.revision === next.project.revision
                            ? after
                            : undefined,
                        );
                      } catch (error) {
                        setNotice(
                          error instanceof Error
                            ? error.message
                            : "Could not remove this asset.",
                        );
                      }
                    }}
                  >
                    <Icon name="minus" size={13} />
                  </button>
                </>
              )}
            </MediaTile>
          );
        })}
      </div>
      <p className="genobi-shelf-hint">
        {director
          ? inspiration
            ? "Drag an image into Style, or choose it from the prompt."
            : "Drag images or video into the prompt. Click used media to swap."
          : inspiration
            ? "Drag a reference into the prompt, or use a copy in a media slot."
            : "Drag media into a slot. Audio stays available in the editor."}
      </p>
    </div>
  );
}
