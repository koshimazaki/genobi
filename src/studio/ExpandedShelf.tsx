import { useState } from "react";
import { MediaDropZone } from "../director/MediaDropZone";
import { importProjectMedia } from "../director/import-project-media";
import { writeAssetDrag } from "../director/asset-drag";
import { AssetFrame } from "../director/AssetThumbnail";
import { useStudio } from "./useStudio";
import { assetFacts, REFERENCE_MARK } from "./asset-facts";
import AssetLightbox, { type LightboxItem } from "./AssetLightbox";
import RecreateButton from "../components/RecreateButton";
import { useShell } from "./ShellContext";
import { assetCameraAction, sendAssetToCamera } from "./camera-handoff";

const KIND = { image: "Image", video: "Video", audio: "Audio" } as const;
type Card = LightboxItem & { poster?: number; layer?: string };

/**
 * One collection of the expanded assets view: every Project or Inspirations
 * file as a large Camera-gallery card. A card drags exactly as the rail's
 * tile does (`writeAssetDrag`, the same identity-only payload) and a click
 * opens the light view; the drop zone imports files as the rail's does.
 * A card's Recreate or Use in Camera (`camera-handoff.ts`) leaves the view
 * (`onLeave`) and opens Camera with it; nothing is generated.
 */
export function ExpandedShelf({
  role,
  onLeave,
}: {
  role: "production" | "reference";
  onLeave?: () => void;
}) {
  const shell = useShell();
  const bundle = useStudio((s) => s.director.bundle);
  const selected = useStudio((s) => s.workspace.selected);
  const blocked = useStudio((s) => Object.values(s.operations).some(Boolean));
  const [viewing, setViewing] = useState<number>();
  const [notice, setNotice] = useState("");
  if (!bundle) return <p className="gallery-footnote">Open a project first.</p>;
  const project = bundle.project;
  const inspiration = role === "reference";
  const items: Card[] = Object.entries(project.assets)
    .filter(([, asset]) => asset.use === role)
    .map(([id]) => {
      const facts = assetFacts(project, id, selected);
      return {
        id,
        asset: facts.asset,
        bytes: bundle.files.get(facts.asset.file.path),
        name: facts.name,
        meta: facts.meta,
        mark: inspiration ? REFERENCE_MARK : undefined,
        poster: facts.range?.inSeconds,
        layer: facts.layer?.name,
      };
    });
  return (
    <div className="assets-expanded-shelf">
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
            inspiration ? "Inspiration added." : "Media added to your project.",
          );
        }}
      />
      {notice && (
        <p className="gallery-footnote" role="status">
          {notice}
        </p>
      )}
      {items.length === 0 ? (
        <div className="gallery-empty">
          <p>
            {inspiration
              ? "No inspirations yet. Drop a style or sound reference above."
              : "No project assets yet. Drop images, video or audio above."}
          </p>
        </div>
      ) : (
        <div className="gallery-grid assets-expanded-grid">
          {items.map((item, index) => {
            const action = shell && assetCameraAction(project, item.id);
            return (
              <article
                key={item.id}
                className="clip-card assets-expanded-card"
                data-kind={item.asset.kind}
              >
                <button
                  type="button"
                  className="clip-media assets-expanded-media"
                  aria-label={`View ${item.name}`}
                  title={item.asset.file.path}
                  draggable={!blocked}
                  onDragStart={(event) => {
                    if (blocked) event.preventDefault();
                    else writeAssetDrag(event.dataTransfer, bundle, item.id);
                  }}
                  onClick={() => setViewing(index)}
                >
                  <AssetFrame
                    asset={item.asset}
                    bytes={item.bytes}
                    seconds={item.poster ?? 0}
                  />
                  <span className="clip-badge">{KIND[item.asset.kind]}</span>
                  {item.mark && (
                    <span className="clip-badge assets-expanded-mark">
                      {item.mark}
                    </span>
                  )}
                </button>
                <div className="clip-info">
                  <h3 title={item.name}>{item.name}</h3>
                  <div className="clip-meta">
                    <span className="clip-facts" title={item.layer}>
                      {item.meta || KIND[item.asset.kind]}
                    </span>
                    <span className="clip-actions">
                      {action && (
                        <RecreateButton
                          label={action.label}
                          ariaLabel={`${action.label}: ${item.name}`}
                          title={action.title}
                          disabled={blocked}
                          onClick={() => {
                            onLeave?.();
                            sendAssetToCamera(
                              shell.select,
                              bundle,
                              item.id,
                            ).catch((error: unknown) =>
                              setNotice(
                                error instanceof Error
                                  ? error.message
                                  : "Could not open this asset in Camera.",
                              ),
                            );
                          }}
                        />
                      )}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {viewing !== undefined && (
        <AssetLightbox
          items={items}
          index={Math.min(viewing, items.length - 1)}
          onIndex={setViewing}
          onClose={() => setViewing(undefined)}
        />
      )}
    </div>
  );
}
