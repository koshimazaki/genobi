import ThemedSelect from "../components/ThemedSelect";
import { useState } from "react";
import type { Bundle } from "./bundle";
import type { PromptBrief, PromptReference } from "./prompt-brief";
import type { ReferencePurpose } from "./prompt-insertion";
import { PromptThumbnail } from "./PromptThumbnail";
export type PromptKind = "image" | "video" | "font" | "references";
export type PromptPicker = {
  kind: PromptKind;
  inline?: boolean;
  query?: string;
  anchor?: { x: number; y: number };
  purpose?: ReferencePurpose;
  swap?: string;
};
export function PromptAssetPicker({
  bundle,
  brief,
  picker,
  blocked,
  onChoose,
  onClose,
  onKind,
  onRemove,
  onAddFont,
  onOpenAssets,
}: {
  bundle: Bundle;
  brief: PromptBrief;
  picker: PromptPicker;
  blocked: boolean;
  onChoose: (reference: Omit<PromptReference, "id" | "label">) => void;
  onClose: () => void;
  onKind: (kind: PromptKind, purpose?: ReferencePurpose) => void;
  onRemove: () => void;
  onAddFont: () => void;
  onOpenAssets: (role: string) => void;
}) {
  const [search, setQuery] = useState(picker.query ?? "");
  const query = picker.inline ? (picker.query ?? "") : search;
  const [role, setRole] = useState("all");
  const fonts = brief.references
    .filter((r) => r.font)
    .filter(
      (r, i, all) =>
        all.findIndex((f) => f.font!.file.sha256 === r.font!.file.sha256) === i,
    );
  const media: PromptReference[] = Object.entries(bundle.project.assets)
    .filter(
      ([, a]) =>
        (picker.kind === "references"
          ? a.kind === "image" || a.kind === "video"
          : a.kind === picker.kind) &&
        (role === "all" || a.use === role),
    )
    .map(([assetId]) => ({ id: assetId, label: "", assetId }));
  const items =
    picker.kind === "font"
      ? fonts
      : picker.kind === "references"
        ? [...media, ...fonts]
        : media;
  const name = (r: PromptReference) =>
    r.font?.name ??
    (r.assetId
      ? bundle.project.assets[r.assetId]?.file.path.split("/").at(-1)
      : undefined) ??
    "Missing file";
  const filtered = items.filter((r) =>
    name(r).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div
      className="prompt-asset-picker"
      data-inline={picker.inline || undefined}
      style={
        picker.inline && picker.anchor
          ? {
              left: `clamp(12px, ${picker.anchor.x}px, max(12px, 100% - 350px))`,
              top: picker.anchor.y,
              right: "auto",
              width: "min(340px, calc(100% - 24px))",
            }
          : undefined
      }
      role="region"
      aria-label={`Choose ${picker.purpose?.toLowerCase() ?? picker.kind}`}
      id="prompt-reference-picker"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="prompt-picker-heading">
        <strong>
          {picker.swap
            ? "Swap reference"
            : picker.purpose
              ? `Choose ${picker.purpose.toLowerCase()}`
              : picker.kind === "references"
                ? "Add a reference"
                : `Choose ${picker.kind}`}
        </strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reference picker"
        >
          Close
        </button>
      </div>
      {!picker.swap && (
        <div className="prompt-picker-kinds" aria-label="Reference type">
          <button
            type="button"
            aria-pressed={picker.purpose === "Character"}
            onClick={() => onKind("image", "Character")}
          >
            Character
          </button>
          <button
            type="button"
            aria-pressed={picker.purpose === "Style"}
            onClick={() => onKind("image", "Style")}
          >
            Style
          </button>
          <button
            type="button"
            aria-pressed={picker.kind === "image" && !picker.purpose}
            onClick={() => onKind("image")}
          >
            Image
          </button>
          <button
            type="button"
            aria-pressed={picker.kind === "video"}
            onClick={() => onKind("video")}
          >
            Video
          </button>
          <button
            type="button"
            aria-pressed={picker.kind === "font"}
            onClick={() => onKind("font")}
          >
            Font
          </button>
        </div>
      )}
      {!picker.inline && (
        <div className="prompt-picker-filters">
          <input
            aria-label="Find prompt asset"
            placeholder="Search your project…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {picker.kind !== "font" && (
            <ThemedSelect
              aria-label="Asset source"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="all">Assets & inspirations</option>
              <option value="production">Assets</option>
              <option value="reference">Inspirations</option>
            </ThemedSelect>
          )}
        </div>
      )}
      <div className="prompt-picker-grid">
        {filtered.map((r) => (
          <button
            type="button"
            key={r.id}
            disabled={blocked}
            data-suggestion
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
              e.preventDefault();
              const items = [
                ...e.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                  "[data-suggestion]",
                ),
              ];
              items[
                (items.indexOf(e.currentTarget) +
                  (e.key === "ArrowDown" ? 1 : items.length - 1)) %
                  items.length
              ]?.focus();
            }}
            onClick={() =>
              onChoose(r.font ? { font: r.font } : { assetId: r.assetId })
            }
          >
            <PromptThumbnail bundle={bundle} reference={r} />
            <strong>{name(r)}</strong>
            <small>
              {r.font
                ? "Font"
                : bundle.project.assets[r.assetId!].use === "reference"
                  ? "Inspiration"
                  : "Asset"}
            </small>
          </button>
        ))}
      </div>
      {!filtered.length && (
        <p>
          {query
            ? "No matching files."
            : picker.kind === "font"
              ? "Add a font file to reference it."
              : "Add media to Assets or Inspirations first."}
        </p>
      )}
      {picker.kind === "font" ? (
        <button type="button" disabled={blocked} onClick={onAddFont}>
          Add font file
        </button>
      ) : (
        <button
          type="button"
          disabled={blocked}
          onClick={() => onOpenAssets(role)}
        >
          Open assets & inspirations
        </button>
      )}
      {picker.swap && (
        <button type="button" disabled={blocked} onClick={onRemove}>
          Remove from prompt
        </button>
      )}
    </div>
  );
}
