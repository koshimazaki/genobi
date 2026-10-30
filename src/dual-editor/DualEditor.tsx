import { WorkspaceHeading } from "../studio/WorkspaceHeading";
import { StudioPanel, useShell } from "../studio/ShellContext";
import { useEffect, useRef, useState } from "react";
import ThemePicker from "../components/ThemePicker";
import { useFrameEdits } from "./useFrameEdits";
import { useTimeline } from "./useTimeline";
import TimelineEditor from "./TimelineEditor";
import FramePanel from "./FramePanel";
import AssetDrawer from "./AssetDrawer";
import { useEditorAssets } from "./useEditorAssets";
import { useFrameSlot } from "./useFrameSlot";
import {
  captureFrame,
  choosePngDestination,
  saveBlob,
  type FrameAsset,
} from "./export-frame";
import { frameFilename, timeLabel } from "./frame-math";
import "./dual-editor.css";
import "./dual-editor-panels.css";

/**
 * Embed in a host and receive full-resolution assets without a download:
 * `onCapture` for Keep frame, `onExport` for Export to assets. Without
 * `onExport` the export button downloads the PNG instead.
 */
export function DualEditor({
  onCapture,
  onExport,
}: {
  onCapture?: (asset: FrameAsset) => unknown;
  onExport?: (asset: FrameAsset) => unknown;
}) {
  const loads = useRef({ A: 0, B: 0 });
  const shell = useShell();
  const a = useFrameSlot(),
    b = useFrameSlot();
  const editA = useFrameEdits(a),
    editB = useFrameEdits(b);
  const timeline = useTimeline();
  const [mode, setMode] = useState<"frames" | "timeline">("frames");
  const [localDrawer, setLocalDrawer] = useState(false);
  const drawer = shell ? shell.assetsOpen : localDrawer;
  const setDrawer = shell ? shell.setAssetsOpen : setLocalDrawer;
  const ownLibrary = useEditorAssets(!shell);
  const library = shell?.library ?? ownLibrary;
  const [guides, setGuides] = useState(false);
  const [notice, setNotice] = useState(""),
    [exporting, setExporting] = useState(false);
  const [assets, setAssets] = useState<(FrameAsset & { url: string })[]>([]);
  const urls = useRef(new Set<string>()),
    exportLock = useRef(false);
  useEffect(
    () => () => {
      loads.current.A++;
      loads.current.B++;
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    },
    [],
  );
  function loadLocal(file: File, label: "A" | "B") {
    loads.current[label]++;
    library.addLocal(file);
    void (label === "A" ? a : b).load(file);
  }
  async function loadAsset(id: string, label: "A" | "B") {
    const ticket = ++loads.current[label];
    setNotice(`Loading asset into ${label}…`);
    try {
      const file = await library.resolve(id);
      if (file && ticket === loads.current[label]) {
        void (label === "A" ? a : b).load(file);
        setNotice(`Loaded asset into ${label}.`);
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not load asset.",
      );
    }
  }
  function step(label: "A" | "B", delta: number) {
    const slot = label === "A" ? a : b;
    slot.seek(slot.selected + delta);
  }
  async function output(
    label: "A" | "B",
    mode: "download" | "save" | "keep" | "assets",
  ) {
    if (exportLock.current) return;
    const slot = label === "A" ? editA.slot : editB.slot;
    if (!slot.ready || !slot.source) return;
    exportLock.current = true;
    setExporting(true);
    setNotice("");
    try {
      // Open the picker before encoding so browser user activation is retained.
      const destination =
        mode === "save"
          ? choosePngDestination(frameFilename(slot.source.name, slot.selected))
          : null;
      // Await picker first: cancellation must not leave an unhandled rejection.
      const handle = destination ? await destination : null;
      const asset = await captureFrame(slot, label);
      if (mode === "keep") {
        if (assets.length >= 12)
          throw new Error(
            "The tray holds 12 frames. Remove one before keeping another.",
          );
        await onCapture?.(asset);
        const url = URL.createObjectURL(asset.blob);
        urls.current.add(url);
        setAssets((items) => [...items, { ...asset, url }]);
        setNotice(`Kept ${label} · frame ${asset.frame}.`);
      } else if (mode === "assets" && onExport) {
        await onExport(asset);
        setNotice(
          `Exported ${label} · frame ${asset.frame} to project assets · ${asset.width} × ${asset.height}`,
        );
      } else {
        await saveBlob(
          asset.blob,
          asset.filename,
          handle ? Promise.resolve(handle) : null,
        );
        setNotice(
          handle
            ? `Saved ${asset.filename}`
            : `PNG sent to browser downloads · ${asset.width} × ${asset.height}`,
        );
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setNotice(error instanceof Error ? error.message : "Export failed.");
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }
  function remove(id: string) {
    const asset = assets.find((item) => item.id === id);
    if (asset) {
      URL.revokeObjectURL(asset.url);
      urls.current.delete(asset.url);
    }
    setAssets((items) => items.filter((item) => item.id !== id));
  }
  function manifest() {
    const frames = assets.map(
      ({ id, filename, source, frame, timestamp, width, height, slot }) => ({
        id,
        filename,
        source,
        frame,
        timestamp,
        width,
        height,
        slot,
      }),
    );
    void saveBlob(
      new Blob([JSON.stringify({ version: 1, frames }, null, 2)], {
        type: "application/json",
      }),
      "dual-editor-frames.json",
    );
  }
  return (
    <StudioPanel id="dual">
      <div className="dual-editor">
        <div className="de-heading">
          <WorkspaceHeading
            title="Dual Swords"
            icon="swords"
            purpose="Extract frames / Slice videos."
          />
          <div className="de-options">
            <button
              className="de-button"
              aria-pressed={guides}
              onClick={() => setGuides(!guides)}
            >
              ⊞ Alignment guides
            </button>
            <button
              className="de-button"
              aria-expanded={drawer}
              aria-controls={shell ? "studio-assets" : "director-assets"}
              onClick={() => setDrawer(!drawer)}
            >
              Assets {drawer ? "›" : "‹"}
            </button>
          </div>
        </div>
        <div className="de-mode-switch" role="group" aria-label="Editor mode">
          <button
            className="de-button"
            aria-pressed={mode === "frames"}
            onClick={() => setMode("frames")}
          >
            ◫ Frames
          </button>
          <button
            className="de-button"
            aria-pressed={mode === "timeline"}
            onClick={() => setMode("timeline")}
          >
            ▤ Timeline
          </button>
        </div>
        <div
          className={`de-workspace ${!shell && drawer ? "de-workspace--assets" : ""}`}
        >
          <div hidden={mode !== "frames"}>
            <div className="de-pair" aria-busy={exporting}>
              {(["A", "B"] as const).map((label) => (
                <FramePanel
                  key={label}
                  label={label}
                  slot={label === "A" ? editA.slot : editB.slot}
                  edit={label === "A" ? editA : editB}
                  other={label === "A" ? editB : editA}
                  guides={guides}
                  onLoad={(file) => loadLocal(file, label)}
                  onAsset={(id) => void loadAsset(id, label)}
                  onClear={() => {
                    loads.current[label]++;
                    (label === "A" ? a : b).clear();
                  }}
                  onStep={(delta) => step(label, delta)}
                  onCapture={() => void output(label, "keep")}
                  toAssets={Boolean(onExport)}
                  onExport={(to) =>
                    void output(
                      label,
                      to === "save" ? "save" : onExport ? "assets" : "download",
                    )
                  }
                />
              ))}
            </div>
          </div>
          <div hidden={mode !== "timeline"}>
            <TimelineEditor
              active={
                mode === "timeline" &&
                (!shell || shell.visible.includes("dual"))
              }
              session={timeline}
              slots={{ A: a, B: b }}
              onAsset={async (id) => library.resolve(id)}
              onFrame={(file, frame, label) => {
                loads.current[label]++;
                void (label === "A" ? a : b).load(file, frame);
                setMode("frames");
              }}
            />
          </div>
          {shell ? (
            <StudioPanel id="toolAssets">
              <AssetDrawer
                embedded
                library={library}
                onLoad={(id, label) => void loadAsset(id, label)}
                onClose={() => setDrawer(false)}
              />
            </StudioPanel>
          ) : (
            <div
              className="de-sidebar-shell"
              id="director-assets"
              inert={!drawer}
            >
              <AssetDrawer
                library={library}
                onLoad={(id, label) => void loadAsset(id, label)}
                onClose={() => setDrawer(false)}
              />
            </div>
          )}
        </div>
        <div className="de-notes">
          <span>LOCAL PROCESSING · FULL-RESOLUTION PNG</span>
          <span>Frames start at 0 · ← / → on a fader steps one frame</span>
        </div>
        <p className="de-notice" role="status">
          {exporting
            ? "Preparing frame…"
            : notice ||
              "Drop videos or images in the viewers. Files stay in this tab."}
        </p>
        <section className="de-tray" aria-label="Kept frame assets">
          <header>
            <h2>
              Frame assets <span>{String(assets.length).padStart(2, "0")}</span>
            </h2>
            <button
              className="de-text-button"
              disabled={!assets.length}
              onClick={manifest}
            >
              Export manifest ↗
            </button>
          </header>
          {!assets.length ? (
            <p>
              Keep selected frames here as reference assets for your next shot.
            </p>
          ) : (
            <div className="de-asset-grid">
              {assets.map((asset) => (
                <article key={asset.id}>
                  <img
                    src={asset.url}
                    alt={`${asset.source}, frame ${asset.frame}`}
                  />
                  <div>
                    <span>
                      {asset.slot} / {String(asset.frame).padStart(6, "0")}
                    </span>
                    <span>{timeLabel(asset.timestamp)}</span>
                  </div>
                  <footer>
                    <button
                      className="de-text-button"
                      onClick={() => void saveBlob(asset.blob, asset.filename)}
                    >
                      PNG ↓
                    </button>
                    <button
                      className="de-text-button"
                      onClick={() => remove(asset.id)}
                      aria-label={`Remove kept frame ${asset.frame} from ${asset.slot}`}
                    >
                      Remove
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
        <p className="de-footnote">
          Scopes show sampled sRGB luma, with black ≤ 1 and white ≥ 254. PNG
          export uses the browser’s decoded sRGB image, not an HDR master. Save
          as opens a file picker where supported; otherwise your browser’s
          download settings apply.
        </p>
      </div>
    </StudioPanel>
  );
}

export default function DualEditorPage() {
  return (
    <main className="de-page">
      <nav className="de-nav" aria-label="Workspace">
        <a href="/">‹ Camera Director</a>
        <div>
          <span className="de-local">
            <i /> On your device
          </span>
          <ThemePicker />
        </div>
      </nav>
      <DualEditor />
    </main>
  );
}
