import ThemedSelect from "../components/ThemedSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShell } from "../studio/ShellContext";
import { studioDropFile } from "../studio/media-drop";
import { studioStore } from "../studio/store";
import TickFader from "../components/TickFader";
import { pixelLevels, rulerWindow, timeLabel } from "./frame-math";
import FrameEditControls from "./FrameEditControls";
import type { FrameEdits } from "./useFrameEdits";
import type { FrameSlot } from "./useFrameSlot";

export default function FramePanel({
  label,
  slot,
  guides,
  onLoad,
  onAsset,
  onClear,
  onStep,
  onExport,
  toAssets,
  onCapture,
  edit,
  other,
}: {
  label: "A" | "B";
  edit: FrameEdits;
  other: FrameEdits;
  slot: FrameSlot;
  guides: boolean;
  onLoad: (file: File) => void;
  onAsset: (id: string) => void;
  onClear: () => void;
  onStep: (delta: number) => void;
  /** `assets`: into the project (or a download when `toAssets` is off). */
  onExport: (to: "assets" | "save") => void;
  toAssets?: boolean;
  onCapture: () => void;
}) {
  const [dropError, setDropError] = useState("");
  const [editing, setEditing] = useState(false);
  const shell = useShell();
  const [expanded, setExpanded] = useState(true);
  const [scopesOpen, setScopesOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false),
    [zoom, setZoom] = useState("fit");
  const [span, setSpan] = useState(0),
    [windowStart, setWindowStart] = useState(0);
  const [jump, setJump] = useState("0");
  const count = slot.source?.frames.length ?? 0;
  const max = Math.max(0, count - 1);
  const range: [number, number] = span
    ? [windowStart, Math.min(max, windowStart + span)]
    : [0, max];
  const shown = slot.shown;
  useEffect(() => {
    setJump(String(slot.selected));
  }, [slot.selected]);
  useEffect(() => {
    setSpan(0);
    setWindowStart(0);
  }, [slot.source]);
  useEffect(() => {
    if (
      span &&
      (slot.selected < windowStart || slot.selected > windowStart + span)
    )
      setWindowStart(rulerWindow(slot.selected, count, span)[0]);
  }, [slot.selected, span, windowStart, count]);
  useEffect(() => {
    if (!canvas.current || !shown) return;
    canvas.current.width = shown.canvas.width;
    canvas.current.height = shown.canvas.height;
    canvas.current.getContext("2d")?.drawImage(shown.canvas, 0, 0);
  }, [shown]);
  const levels = useMemo(() => {
    if (!shown) return null;
    const small = document.createElement("canvas");
    small.width = 256;
    small.height = Math.max(
      1,
      Math.round((256 * shown.canvas.height) / shown.canvas.width),
    );
    const context = small.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(shown.canvas, 0, 0, small.width, small.height);
    return pixelLevels(
      context.getImageData(0, 0, small.width, small.height).data,
    );
  }, [shown]);
  const busy =
    !slot.ready &&
    (slot.status.startsWith("Indexing") || slot.status.startsWith("Decoding"));
  function setScale(value: number) {
    setSpan(value);
    setWindowStart(rulerWindow(slot.selected, count, value)[0]);
  }
  function jumpToFrame() {
    if (jump.trim() && Number.isFinite(Number(jump))) slot.seek(Number(jump));
    else setJump(String(slot.selected));
  }
  return (
    <section
      className={`de-panel ${dragging ? "de-panel--drag" : ""}`}
      aria-label={`Video ${label}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const id = event.dataTransfer.getData("application/x-director-video");
        if (id && !shell) {
          onAsset(id);
          return;
        }
        void studioDropFile(
          event.dataTransfer,
          studioStore.getState().director.bundle,
          shell?.library,
        )
          .then((file) => {
            if (file) {
              onLoad(file);
              setDropError("");
            }
          })
          .catch((error) => setDropError(String(error)));
      }}
    >
      {dropError && <p role="alert">{dropError}</p>}
      <input
        ref={input}
        type="file"
        accept="video/*,image/png,image/jpeg,image/webp,.mp4,.mov,.mkv,.webm,.m4v"
        className="sr-only"
        aria-label={`Choose video ${label}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onLoad(file);
          event.target.value = "";
        }}
      />
      <header className="de-panel-head">
        <span className="de-channel">{label}</span>
        <div className="de-file">
          <strong title={slot.source?.name}>
            {slot.source?.name ?? `Video ${label}`}
          </strong>
          <span>
            {slot.source
              ? `${slot.source.width} × ${slot.source.height} · ${count.toLocaleString()} frames · ${slot.source.codec.toUpperCase()}`
              : "MP4 / MOV / WEBM · LOCAL FILE"}
          </span>
        </div>
        <button
          className="de-text-button"
          onClick={() => input.current?.click()}
        >
          {slot.source ? "Replace" : "Open"}
        </button>
        {(slot.source || busy) && (
          <button
            className="de-text-button"
            aria-label={`Clear video ${label}`}
            onClick={onClear}
          >
            ×
          </button>
        )}
      </header>
      <div
        className={`de-view ${zoom === "fit" ? "" : "de-view--pixel"}`}
        aria-busy={busy}
      >
        {shown ? (
          <div
            className="de-image"
            style={
              zoom === "fit"
                ? {
                    aspectRatio: `${shown.canvas.width} / ${shown.canvas.height}`,
                  }
                : {
                    width: shown.canvas.width * Number(zoom),
                    height: shown.canvas.height * Number(zoom),
                  }
            }
          >
            <canvas
              ref={canvas}
              aria-label={`Video ${label}, decoded frame ${shown.index}`}
            />
            {guides && (
              <div className="de-guides" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <span>+</span>
              </div>
            )}
          </div>
        ) : (
          <button className="de-drop" onClick={() => input.current?.click()}>
            <svg
              width="56"
              height="42"
              viewBox="0 0 56 42"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M1 13V1h12M43 1h12v12M55 29v12H43M13 41H1V29"
                stroke="currentColor"
              />
              <path d="M28 12v18M19 21h18" stroke="currentColor" />
            </svg>
            <strong>Drop video or image {label}</strong>
            <span>or browse files</span>
          </button>
        )}
      </div>
      <div className="de-view-tools">
        <span className={busy ? "de-pending" : ""} role="status">
          {slot.status}
        </span>
        <button
          className="de-edit-toggle"
          disabled={!slot.ready}
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          Edit frame {editing ? "−" : "+"}
        </button>
        <label>
          View{" "}
          <ThemedSelect
            aria-label={`Video ${label} viewer zoom`}
            value={zoom}
            onChange={(e) => setZoom(e.target.value)}
          >
            <option value="fit">Fit</option>
            <option value="1">100%</option>
            <option value="2">200%</option>
          </ThemedSelect>
        </label>
      </div>
      {editing && <FrameEditControls label={label} edit={edit} other={other} />}
      {slot.error && (
        <p className="de-error" role="alert">
          {slot.error}
        </p>
      )}
      <div className="de-controls">
        <div className="de-readouts">
          <div>
            <span>FRAME / ZERO-BASED</span>
            <strong>
              {String(slot.selected).padStart(6, "0")}
              <small> / {String(max).padStart(6, "0")}</small>
            </strong>
          </div>
          <div className="de-time">
            <span>PRESENTATION TIME</span>
            <strong>
              {timeLabel(slot.source?.frames[slot.selected]?.timestamp ?? 0)}
            </strong>
          </div>
        </div>
        <button
          className="de-fold-toggle"
          aria-expanded={expanded}
          aria-controls={`controls-${label}`}
          onClick={() => setExpanded(!expanded)}
        >
          Frame position <span>{expanded ? "−" : "+"}</span>
        </button>
        <div
          className={`de-fold ${expanded ? "de-fold--open" : ""}`}
          id={`controls-${label}`}
          inert={!expanded}
        >
          <div>
            <fieldset disabled={!slot.source}>
              <div className="de-ruler-tools">
                <span>Timeline</span>
                <div role="group" aria-label={`Video ${label} timeline zoom`}>
                  {[
                    [0, "Full"],
                    [120, "120f"],
                    [24, "24f"],
                  ].map(([value, title]) => (
                    <button
                      key={value}
                      aria-pressed={span === value}
                      onClick={() => setScale(Number(value))}
                    >
                      {title}
                    </button>
                  ))}
                </div>
              </div>
              {span > 0 && (
                <input
                  className="de-overview"
                  aria-label={`Video ${label} full timeline`}
                  type="range"
                  min="0"
                  max={max}
                  step="1"
                  value={slot.selected}
                  onChange={(e) => slot.seek(e.target.valueAsNumber)}
                />
              )}
              <TickFader
                id={`frame-${label}`}
                label={span ? "Fine frame position" : "Frame position"}
                value={slot.selected}
                min={range[0]}
                max={range[1]}
                step={1}
                onChange={slot.seek}
                valueLabel={`${slot.selected}f`}
              />
              <div className="de-transport">
                <div className="de-step-buttons">
                  <button
                    aria-label={`Video ${label} first frame`}
                    onClick={() => slot.seek(0)}
                  >
                    │‹
                  </button>
                  <button
                    aria-label={`Video ${label} previous frame`}
                    onClick={() => onStep(-1)}
                  >
                    −1
                  </button>
                  <button
                    aria-label={`Video ${label} next frame`}
                    onClick={() => onStep(1)}
                  >
                    +1
                  </button>
                  <button
                    aria-label={`Video ${label} last frame`}
                    onClick={() => slot.seek(max)}
                  >
                    ›│
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    jumpToFrame();
                  }}
                >
                  <label>
                    Go to{" "}
                    <input
                      aria-label={`Video ${label} frame number`}
                      type="number"
                      min="0"
                      max={max}
                      step="1"
                      value={jump}
                      onChange={(e) => setJump(e.target.value)}
                    />
                  </label>
                  <button type="submit">↵</button>
                </form>
              </div>
            </fieldset>
          </div>
        </div>
      </div>
      <button
        className="de-fold-toggle de-scopes-toggle"
        aria-expanded={scopesOpen}
        aria-controls={`scopes-${label}`}
        onClick={() => setScopesOpen(!scopesOpen)}
      >
        Luma distribution <span>{scopesOpen ? "−" : "+"}</span>
      </button>
      <div
        id={`scopes-${label}`}
        className={`de-fold ${scopesOpen ? "de-fold--open" : ""}`}
        inert={!scopesOpen}
      >
        <div>
          <div className="de-scopes">
            <div className="de-scope-label">
              <span>LUMA DISTRIBUTION</span>
              <span>0 — 255</span>
            </div>
            <svg
              viewBox="0 0 256 34"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Video ${label} luma histogram`}
            >
              <path
                d={
                  levels
                    ? `M0 34 ${levels.histogram.map((n, i) => `L${i * 4 + 2} ${34 - (32 * n) / Math.max(1, ...levels.histogram)}`).join(" ")} L256 34Z`
                    : "M0 33H256"
                }
              />
            </svg>
            <div className="de-levels">
              <span>
                Mean <b>{levels ? levels.luma.toFixed(1) : "—"}%</b>
              </span>
              <span>
                Black <b>{levels ? levels.black.toFixed(1) : "—"}%</b>
              </span>
              <span>
                White <b>{levels ? levels.white.toFixed(1) : "—"}%</b>
              </span>
            </div>
          </div>
        </div>
      </div>
      <footer className="de-export">
        <button
          className="de-button"
          disabled={!slot.ready}
          onClick={onCapture}
        >
          ＋ Keep frame
        </button>
        <div>
          <button
            className="de-button de-button--primary"
            disabled={!slot.ready}
            onClick={() => onExport("assets")}
            title={
              toAssets
                ? "Add this PNG frame to the project's assets, under Project"
                : "Download this PNG frame"
            }
          >
            {toAssets ? "Export to assets" : "Export PNG ↓"}
          </button>
          <button
            className="de-button"
            disabled={!slot.ready}
            onClick={() => onExport("save")}
            title="Save the PNG to your drive: choose a folder when supported; otherwise use browser downloads"
          >
            Save to disk…
          </button>
        </div>
      </footer>
    </section>
  );
}
