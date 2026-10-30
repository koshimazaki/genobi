import ThemedSelect from "../components/ThemedSelect";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import type { useScrolls } from "./useScrolls";
import { timedCells } from "../../shared/scrolls/commands";
import { beatLines } from "../../shared/director/beat-grid";
import {
  audioInterval,
  retimeCell,
  scrollGrid,
  sourceSample,
  type ScrollSnap,
  type TimingMode,
} from "../../shared/scrolls/timing";
import type { ScrollCell, ScrollDocument } from "../../shared/scrolls/types";
import { useScrollPlayback } from "./Preview";
import Icon from "../components/Icon";
import { TimingSettings } from "./TimingSettings";
import "./timeline.css";
type Drag = {
  id: string;
  mode: TimingMode;
  clientX: number;
  frame: number;
  pixels: number;
  before: ReturnType<typeof useScrolls>["bundle"];
};
export function ScrollTimeline({
  s,
  urls,
  active,
  importAudio,
}: {
  s: ReturnType<typeof useScrolls>;
  urls: Record<string, string>;
  active: boolean;
  importAudio: () => void;
}) {
  const d = s.bundle.document,
    p = useScrollPlayback({ bundle: s.bundle, active });
  const [snap, setSnap] = useState<ScrollSnap>("beat"),
    [ghost, setGhost] = useState<ScrollDocument>(),
    [availableWidth, setAvailableWidth] = useState(700),
    [dragError, setDragError] = useState("");
  const ghostRef = useRef<ScrollDocument | undefined>(undefined);
  function updateGhost(value: ScrollDocument | undefined) {
    ghostRef.current = value;
    setGhost(value);
  }
  const drag = useRef<Drag | undefined>(undefined),
    scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setAvailableWidth(node.clientWidth),
    );
    setAvailableWidth(node.clientWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const cells = timedCells(ghost ?? d),
    pixels = Math.max(cells.length * 100, availableWidth - 100) / p.duration,
    width = p.duration * pixels,
    gutter = 100,
    grid = scrollGrid(d),
    audio = audioInterval(d);
  const disabled = s.busy || p.playing || p.rendering;
  const number = (c: ScrollCell) =>
    String(d.cells.findIndex((v) => v.id === c.id) + 1).padStart(2, "0");
  function begin(e: PointerEvent, c: (typeof cells)[number], mode: TimingMode) {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    s.setSelectedCell(c.id);
    setDragError("");
    updateGhost(undefined);
    drag.current = {
      id: c.id,
      mode,
      clientX: e.clientX,
      frame: mode === "right" ? c.startFrame + c.durationFrames : c.startFrame,
      before: s.bundle,
      pixels,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    const g = drag.current;
    if (!g) return;
    try {
      updateGhost(
        retimeCell(
          g.before.document,
          g.id,
          g.mode,
          g.frame + (e.clientX - g.clientX) / g.pixels,
          e.altKey ? "frame" : snap,
        ),
      );
      setDragError("");
    } catch (error) {
      updateGhost(undefined);
      setDragError((error as Error).message);
    }
  }
  function end() {
    const g = drag.current;
    if (g && ghostRef.current) {
      try {
        s.commit({ ...g.before, document: ghostRef.current }, g.before);
      } catch (error) {
        s.setMessage((error as Error).message);
      }
    }
    drag.current = undefined;
    updateGhost(undefined);
  }
  function key(e: KeyboardEvent, c: (typeof cells)[number]) {
    if (disabled || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    try {
      s.commit({
        ...s.bundle,
        document: retimeCell(
          d,
          c.id,
          e.shiftKey ? "right" : "move",
          (e.shiftKey ? c.startFrame + c.durationFrames : c.startFrame) +
            dir * (snap === "beat" ? grid.step : 1),
          snap,
        ),
      });
    } catch (error) {
      s.setMessage((error as Error).message);
    }
  }
  function seek(e: PointerEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    p.seek((e.clientX - rect.left) / pixels);
  }
  const sample = sourceSample(p.frame, d, p.sampleRate);
  return (
    <section
      className="scroll-timeline"
      aria-label="Linked storyboard timeline"
    >
      <div className="scroll-timeline-toolbar">
        <button
          disabled={!p.ready || p.rendering}
          onClick={() => void p.toggle()}
          aria-label={p.playing ? "Pause animatic" : "Play animatic"}
        >
          <Icon name={p.playing ? "pause" : "play"} />
        </button>
        <output>
          {(p.frame / d.timing.fps).toFixed(2)} /{" "}
          {(p.duration / d.timing.fps).toFixed(2)}s
        </output>
        <label>
          Snap
          <ThemedSelect
            value={snap}
            onChange={(e) => setSnap(e.target.value as ScrollSnap)}
          >
            <option value="beat">Beat</option>
            <option value="frame">Frame</option>
          </ThemedSelect>
        </label>
        <span>Image, camera & action linked</span>
        <button onClick={importAudio} disabled={disabled}>
          Import audio
        </button>
      </div>
      <div
        className="scroll-timeline-scroll"
        ref={scroll}
        role="region"
        aria-label="Scrollable storyboard tracks"
        tabIndex={0}
      >
        <div
          className="scroll-timeline-surface"
          style={{ width: width + gutter }}
        >
          <div className="scroll-timeline-ruler">
            <span className="scroll-lane-label">{d.timing.fps} fps</span>
            <div
              className="scroll-lane-content"
              style={{ width }}
              onPointerDown={seek}
            >
              {Array.from(
                { length: Math.ceil(p.duration / d.timing.fps) },
                (_, i) => (
                  <span key={i} style={{ left: i * d.timing.fps * pixels }}>
                    {i}s
                  </span>
                ),
              )}
            </div>
          </div>
          <div
            className="scroll-beat-lines"
            style={{ left: gutter, width }}
            aria-hidden="true"
          >
            {beatLines(p.duration, grid).map(({ frame, bar }) => (
              <i
                key={frame}
                className={bar ? "bar" : ""}
                style={{ left: frame * pixels }}
              />
            ))}
          </div>
          {(["image", "camera", "action"] as const).map((kind) => (
            <div className="scroll-timeline-row" key={kind}>
              <span className="scroll-lane-label">
                {kind[0].toUpperCase() + kind.slice(1)}
              </span>
              <div className="scroll-lane-content" style={{ width }}>
                {cells.map((c) => (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`${kind} ${number(c)}: ${c.title}. Drag linked group; arrow keys move, Shift arrows trim.`}
                    aria-pressed={s.selectedCell === c.id}
                    key={c.id}
                    className="scroll-timeline-clip"
                    data-kind={kind}
                    style={{
                      left: c.startFrame * pixels,
                      width: c.durationFrames * pixels,
                    }}
                    onClick={() => s.setSelectedCell(c.id)}
                    onPointerDown={(e) => begin(e, c, "move")}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={() => {
                      drag.current = undefined;
                      updateGhost(undefined);
                    }}
                    onKeyDown={(e) => key(e, c)}
                  >
                    <span
                      className="scroll-trim left"
                      onPointerDown={(e) => begin(e, c, "left")}
                    />
                    {kind === "image" ? (
                      <>
                        {c.assetId &&
                        urls[c.assetId] &&
                        d.assets.find((a) => a.id === c.assetId)?.role ===
                          "panel" ? (
                          <img src={urls[c.assetId]} alt="Accepted frame" />
                        ) : (
                          <span className="scroll-unassigned">
                            {number(c)} ·{" "}
                            {c.assetId
                              ? "Reference only"
                              : c.region
                                ? "Mapped, not extracted"
                                : "No frame yet"}
                          </span>
                        )}
                        <b>{number(c)}</b>
                      </>
                    ) : (
                      <span>{c[kind] || "Set direction"}</span>
                    )}
                    <span
                      className="scroll-trim right"
                      onPointerDown={(e) => begin(e, c, "right")}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="scroll-timeline-row">
            <span className="scroll-lane-label">Audio</span>
            <div className="scroll-lane-content" style={{ width }}>
              {audio ? (
                <div
                  className="scroll-audio-interval"
                  style={{
                    left: audio.startFrame * pixels,
                    width: audio.durationFrames * pixels,
                  }}
                >
                  {p.waveform.length ? (
                    <svg
                      className="scroll-waveform"
                      viewBox={`0 0 ${p.waveform.length} 32`}
                      preserveAspectRatio="none"
                      aria-label="Waveform measured from decoded audio"
                    >
                      <path
                        d={p.waveform
                          .map((v, i) => `M${i},${16 - v * 15}v${v * 30}`)
                          .join(" ")}
                      />
                    </svg>
                  ) : (
                    <span>
                      {p.error ? "Audio unavailable" : "Decoding audio…"}
                    </span>
                  )}
                </div>
              ) : (
                <button onClick={importAudio}>Add a soundtrack</button>
              )}
            </div>
          </div>
          <div
            className="scroll-playhead"
            aria-hidden="true"
            style={{ left: gutter + p.frame * pixels }}
          />
        </div>
      </div>
      {(p.error || dragError) && <p role="alert">{p.error || dragError}</p>}
      <TimingSettings s={s} disabled={disabled} />
      <details className="scroll-preview">
        <summary>Animatic preview & export</summary>
        <canvas ref={p.canvas} aria-label="Storyboard playback" />
        <div className="scroll-toolbar">
          <button
            disabled={!p.ready || p.rendering}
            onClick={() => void p.exportVideo()}
          >
            Export MP4
          </button>
          {p.rendering && (
            <button onClick={p.cancelExport}>Cancel export</button>
          )}
          <span>
            {p.sampleRate
              ? `Decoded audio: ${p.sampleRate.toLocaleString()} Hz${sample === undefined ? "" : ` · source sample ${sample.toLocaleString()}`}`
              : "Video timing uses whole frames."}
          </span>
        </div>
        <p className="scroll-hint">
          Only assigned panel-role frames play. Extract a reviewed sheet region
          or assign a separate image. Camera/action are guidance, not simulated
          movement. Audio follows the same frame origin; video cuts are not
          sample-accurate.
        </p>
      </details>
    </section>
  );
}
