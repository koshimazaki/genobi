import { useRef, type Ref } from "react";
import type { RailChoices, SavedLayout } from "../../shared/saved-layouts";
import { SavedLayouts } from "./SavedLayouts";
import { download } from "../director/bundle";
import { panels, type PanelId } from "./presets";
import {
  defaultLayout,
  MAX_LAYOUT_BYTES,
  panelWidth,
  parseLayout,
  storeWorkingLayout,
  type NinjaLayout,
} from "./ninja-layout";

export function NinjaControls({
  layout,
  saved,
  onChange,
  onSaved,
  message,
  onMessage,
  rails,
  onApply,
}: {
  layout: NinjaLayout;
  saved: NinjaLayout;
  onChange: (layout: NinjaLayout) => void;
  onSaved: (layout: NinjaLayout) => void;
  message: string;
  onMessage: (message: string) => void;
  /** The Assets rail choices a saved layout keeps beside the arrangement. */
  rails: RailChoices;
  /**
   * Opens a saved layout, or the default arrangement and rails; false when
   * this browser could not keep it as the working layout.
   */
  onApply: (layout: NinjaLayout, rails: RailChoices) => boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(layout) !== JSON.stringify(saved);
  // A later file selection supersedes an earlier asynchronous read.
  const importToken = useRef(0);
  return (
    <div className="genobi-ninja-controls">
      <fieldset className="genobi-picker">
        <legend>Choose your panels</legend>
        {Object.entries(panels)
          .filter(([id]) => id !== "inputs")
          .map(([id, panel]) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={layout.panels.some((p) => p.id === id)}
                onChange={(e) =>
                  onChange({
                    ...layout,
                    panels: e.target.checked
                      ? [
                          ...layout.panels,
                          {
                            id: id as PanelId,
                            width: panelWidth(id as PanelId),
                          },
                        ]
                      : layout.panels.filter((p) => p.id !== id),
                  })
                }
              />
              {panel.title}
            </label>
          ))}
      </fieldset>
      <div className="genobi-layout-toolbar" aria-label="Ninja layout">
        <p>
          Drag a grip to move a panel, or its bottom corner to resize. Fit
          content restores automatic height.
        </p>
        <div className="genobi-layout-actions">
          <button
            aria-pressed={layout.compact !== false}
            onClick={() =>
              onChange({ ...layout, compact: layout.compact === false })
            }
          >
            Fill gaps
          </button>
          <button
            className="genobi-layout-save"
            onClick={() => {
              if (storeWorkingLayout(layout)) {
                onSaved(layout);
                onMessage(
                  "Layout saved in this browser. Your project media is saved separately.",
                );
              } else
                onMessage(
                  "Browser storage is unavailable. Download the layout JSON to keep it.",
                );
            }}
          >
            Save layout
          </button>
          <button
            onClick={() => {
              download(
                new Blob([JSON.stringify(layout, null, 2)], {
                  type: "application/json",
                }),
                "genobi-ninja-layout.json",
              );
              onMessage(
                "Layout JSON downloaded. Load it in Ninja to restore this arrangement.",
              );
            }}
          >
            Download JSON
          </button>
          <button onClick={() => input.current?.click()}>Load JSON</button>
          <button
            disabled={!dirty}
            onClick={() => {
              onChange(saved);
              onMessage("Changes discarded.");
            }}
          >
            Revert changes
          </button>
          <button
            onClick={() => {
              onChange(defaultLayout());
              onMessage(
                "Default arrangement restored. Save layout to keep it.",
              );
            }}
          >
            Reset layout
          </button>
          <span className="genobi-layout-dirty">
            {dirty ? "Unsaved changes" : "No unsaved changes"}
          </span>
        </div>
        <SavedLayouts
          layout={layout}
          rails={rails}
          onMessage={onMessage}
          onApply={(chosen?: SavedLayout) =>
            chosen
              ? onApply(chosen.layout, chosen.rails)
              : onApply(defaultLayout(), {})
          }
        />
        <details className="genobi-layout-json">
          <summary>View layout JSON</summary>
          <pre>{JSON.stringify(layout, null, 2)}</pre>
        </details>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Load Ninja layout JSON"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const token = ++importToken.current;
            try {
              if (file.size > MAX_LAYOUT_BYTES)
                throw new Error("Layout files must be under 8 KB.");
              const next = parseLayout(await file.text());
              if (token !== importToken.current) return;
              onChange(next);
              onMessage(
                "Layout loaded. Save layout to remember it in this browser.",
              );
            } catch (error) {
              if (token === importToken.current)
                onMessage(
                  error instanceof Error
                    ? error.message
                    : "Could not load layout.",
                );
            }
          }}
        />
        <p className="genobi-layout-message" role="status">
          {message}
        </p>
      </div>
    </div>
  );
}

/** The gear beside Ninja that opens and closes its configuration. */
export function NinjaConfigButton({
  editing,
  onToggle,
  ref,
}: {
  editing: boolean;
  onToggle: () => void;
  ref: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      className="genobi-config-button"
      aria-label="Configure Ninja"
      aria-pressed={editing}
      title="Configure Ninja layout"
      onClick={onToggle}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 2-1 3 2 3-2 2 1 3-2-1-3 2-2-2-3-3-1-1-3Z" />
        <circle cx="12" cy="11" r="3" />
      </svg>
    </button>
  );
}
