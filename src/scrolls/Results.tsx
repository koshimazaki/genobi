import { entryLabel } from "../../shared/scrolls/generator";
import { SCROLL_ASSET_DRAG } from "./References";
import type { ScrollAsset, ScrollDocument } from "../../shared/scrolls/types";
import type { AssetUse } from "../../shared/director/asset-media";
import type { AddedAsset } from "../studio/project-assets";
import { SendToDirector } from "../studio/SendToDirector";
import { directorUse } from "./to-project";
export function ScrollResults({
  document: d,
  urls,
  disabled,
  onSelect,
  onAssign,
  onView,
  onRole,
  onHandoff,
  onRemove,
  onProject,
}: {
  document: ScrollDocument;
  urls: Record<string, string>;
  disabled: boolean;
  onSelect: (ids: string[]) => void;
  onAssign: (asset: ScrollAsset) => void;
  onView: (asset: ScrollAsset) => void;
  onRole: (asset: ScrollAsset) => void;
  onRemove: (asset: ScrollAsset) => void;
  onHandoff: (destination: "director" | "video" | "agent") => void;
  /** Adds the asset to the project's assets under the use given. */
  onProject: (asset: ScrollAsset, use: AssetUse) => Promise<AddedAsset>;
}) {
  return (
    <section className="scroll-results" aria-label="Scroll results">
      <div className="scroll-section-heading">
        <div>
          <span className="scroll-eyebrow">KEEP WHAT WORKS</span>
          <h3>
            Your results <span>{d.assets.length}</span>
          </h3>
        </div>
        <span>{d.selectedIds.length} selected</span>
      </div>
      {d.assets.length ? (
        <div className="scroll-result-grid">
          {d.assets.map((a) => (
            <article
              className="scroll-result"
              key={a.id}
              data-selected={d.selectedIds.includes(a.id)}
            >
              <label className="scroll-result-select">
                <input
                  type="checkbox"
                  checked={d.selectedIds.includes(a.id)}
                  disabled={disabled}
                  onChange={(e) =>
                    onSelect(
                      e.target.checked
                        ? [...d.selectedIds, a.id]
                        : d.selectedIds.filter((id) => id !== a.id),
                    )
                  }
                  aria-label={`Select ${a.name}`}
                />
                <span>
                  {a.kind === "image" ? (
                    <img
                      src={urls[a.id]}
                      alt={a.name}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData(SCROLL_ASSET_DRAG, a.id);
                      }}
                    />
                  ) : (
                    <span className="scroll-audio-card">
                      AUDIO
                      <br />
                      {a.durationSeconds?.toFixed(1)}s
                    </span>
                  )}
                </span>
              </label>
              <div className="scroll-result-meta">
                <strong title={a.name}>{a.name}</strong>
                <small
                  title={
                    a.generation
                      ? `${entryLabel(a.generation.entry)}${a.generation.references.length ? `, like ${a.generation.references.map((r) => r.name).join(", ")}` : ""}`
                      : undefined
                  }
                >
                  {a.role} · {a.derivedFrom ? "reviewed crop" : a.origin}
                  {a.generation
                    ? ` · ${entryLabel(a.generation.entry)}${a.generation.references.length ? ` · like ${a.generation.references.length}` : ""}`
                    : ""}
                </small>
              </div>
              <div className="scroll-result-actions">
                {a.kind === "image" && (
                  <>
                    <button
                      disabled={disabled}
                      onClick={() => onView(a)}
                      aria-pressed={d.sheetAssetId === a.id}
                    >
                      View sheet
                    </button>
                    <button disabled={disabled} onClick={() => onAssign(a)}>
                      Use in cell
                    </button>
                    <button disabled={disabled} onClick={() => onRole(a)}>
                      {a.role === "panel"
                        ? "Character reference"
                        : "Use as panel"}
                    </button>
                  </>
                )}
                <SendToDirector
                  disabled={disabled}
                  send={() => onProject(a, directorUse(a.role))}
                />
                <SendToDirector
                  label="Add to assets"
                  disabled={disabled}
                  send={() => onProject(a, "production")}
                />
                <button
                  disabled={disabled}
                  onClick={() => onRemove(a)}
                  aria-label={`Remove ${a.name}`}
                >
                  Remove
                </button>
                <a href={urls[a.id]} download={a.name}>
                  Save
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="scroll-results-empty">
          Generate a sheet or import images. Your candidates will appear here.
        </div>
      )}
      <div className="scroll-handoff-actions">
        <button
          disabled={disabled || !d.selectedIds.length}
          onClick={() => onHandoff("video")}
        >
          Use in video
        </button>
        <button
          disabled={disabled || !d.selectedIds.length}
          onClick={() => onHandoff("director")}
        >
          Open in Director
        </button>
        <button
          disabled={disabled || !d.selectedIds.length}
          onClick={() => onHandoff("agent")}
        >
          Export agent handoff
        </button>
      </div>
    </section>
  );
}
