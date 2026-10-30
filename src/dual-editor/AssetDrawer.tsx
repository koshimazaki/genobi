import ThemedSelect from "../components/ThemedSelect";
import { useState } from "react";
import type { EditorAssets, EditorVideoAsset } from "./useEditorAssets";
import { SendToDirector } from "../studio/SendToDirector";
import {
  addServedMediaToProjectAssets,
  addToProjectAssets,
} from "../studio/project-assets";
import { inAssetRail } from "../studio/send-to-director";

/**
 * A library or session item into the project's assets (Project tab). Only
 * this studio's own media is read, as the drawer's loader insists.
 */
function sendAsset(asset: EditorVideoAsset, from: Element) {
  const keepTab = inAssetRail(from);
  if (asset.file)
    return addToProjectAssets({
      blob: asset.file,
      filename: asset.name,
      use: "production",
      keepTab,
    });
  const url = new URL(asset.url, location.origin);
  if (url.origin !== location.origin)
    throw new Error("Only this Director's saved assets can be sent.");
  return addServedMediaToProjectAssets(
    url.pathname + url.search,
    asset.name,
    "production",
    undefined,
    { keepTab },
  );
}

export default function AssetDrawer({
  embedded = false,
  library,
  onLoad,
  onClose,
}: {
  embedded?: boolean;
  library: EditorAssets;
  onLoad: (id: string, label: "A" | "B") => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const assets = library.assets.filter(
    (item) => filter === "all" || item.origin === filter,
  );
  return (
    <aside className="de-asset-drawer" aria-label="Director media assets">
      {!embedded && (
        <header>
          <div>
            <span className="de-eyebrow">SOURCE LIBRARY</span>
            <h2>Director assets</h2>
          </div>
          <button
            className="de-text-button"
            aria-label="Close assets"
            onClick={onClose}
          >
            ×
          </button>
        </header>
      )}
      <p>Drag an image or clip onto either viewer, or choose A / B.</p>
      <div className="de-asset-filter">
        <ThemedSelect
          aria-label="Asset source"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All media</option>
          <option value="local">Opened in this tab</option>
          <option value="director">Director session</option>
          <option value="library">Studio library</option>
        </ThemedSelect>
        <button
          className="de-text-button"
          onClick={() => void library.refresh()}
        >
          Refresh
        </button>
      </div>
      {library.status && <p role="status">{library.status}</p>}
      <div className="de-source-list">
        {assets.map((asset) => (
          <article
            key={asset.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(
                "application/x-director-video",
                asset.id,
              );
              event.dataTransfer.effectAllowed = "copy";
            }}
          >
            <div className="de-source-thumb">
              {asset.poster || asset.mediaType === "image" ? (
                <img src={asset.poster ?? asset.url} alt="" draggable={false} />
              ) : (
                <video src={asset.url} preload="metadata" muted playsInline />
              )}
            </div>
            <div className="de-source-info">
              <strong title={asset.name}>{asset.name}</strong>
              <span>
                {asset.origin === "local"
                  ? "Opened in this tab"
                  : asset.origin === "library"
                    ? "Studio library"
                    : "Director session"}
              </span>
            </div>
            <footer>
              <button
                className="de-button"
                onClick={() => onLoad(asset.id, "A")}
              >
                Load A
              </button>
              <button
                className="de-button"
                onClick={() => onLoad(asset.id, "B")}
              >
                Load B
              </button>
              <SendToDirector
                className="de-button"
                send={(from) =>
                  Promise.resolve().then(() => sendAsset(asset, from))
                }
              />
              {asset.origin === "local" && (
                <button
                  className="de-text-button"
                  onClick={() => library.removeLocal(asset.id)}
                  aria-label={`Forget ${asset.name}`}
                >
                  ×
                </button>
              )}
            </footer>
          </article>
        ))}
      </div>
      {!assets.length && (
        <p>
          No media in this group yet. Drop a local image or video, or save a
          clip in Director and refresh.
        </p>
      )}
      <small>
        Local files are held in this tab. Reloading clears them. Director assets
        belong to this browser session.
      </small>
    </aside>
  );
}
