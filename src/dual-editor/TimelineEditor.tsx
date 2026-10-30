import ThemedSelect from "../components/ThemedSelect";
import { useShell } from "../studio/ShellContext";
import { studioStore } from "../studio/store";
import { studioDropFile } from "../studio/media-drop";
import { retainsTrim, type TrimPreview } from "./trim-preview";
import { useTimelineKeys } from "../timeline-keys";
import PlaybackControls from "../components/PlaybackControls";
import { useEffect, useRef, useState } from "react";
import {
  boundary,
  clipDuration,
  duration,
  sourceFrame,
  splitClip,
  type Lane,
} from "./timeline-model";
import type { FrameSlot } from "./useFrameSlot";
import type { TimelineSession } from "./useTimeline";
import TimelineExport from "./TimelineExport";
import TimelineClip from "./TimelineClip";
import TimelinePreview from "./TimelinePreview";
import { timeLabel } from "./frame-math";
import "./timeline.css";

export default function TimelineEditor({
  session: s,
  active,
  slots,
  onFrame,
  onAsset,
}: {
  session: TimelineSession;
  active: boolean;
  slots: { A: FrameSlot; B: FrameSlot };
  onFrame: (file: File, frame: number, lane: Lane) => void;
  onAsset: (id: string, lane: Lane) => Promise<File | undefined>;
}) {
  const shell = useShell();
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  const [trim, setTrim] = useState<TrimPreview | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    lane = useRef<Lane>("A");
  const total = duration(s.clips, s.timing),
    selected = s.clips.find((c) => c.id === s.selected),
    source = selected ? s.sources.get(selected.source)! : undefined;
  const locked = s.busy || exportBusy;
  function togglePlay() {
    if (time >= total - 0.001) setTime(0);
    setTrim(null);
    setPlaying(!playing);
  }
  function splitSelected() {
    if (!selected || !source) return;
    try {
      const parts = splitClip(
        selected,
        source.engine,
        time,
        crypto.randomUUID(),
      );
      if (
        s.commit(s.clips.flatMap((c) => (c.id === selected.id ? parts : [c])))
      )
        s.select(parts[1].id);
    } catch (e) {
      s.setMessage((e as Error).message);
    }
  }
  function deleteSelected() {
    if (selected && s.commit(s.clips.filter((c) => c.id !== selected.id)))
      s.select("");
  }
  // Same keys and panel scoping as the Director timeline.
  useTimelineKeys(
    active && !locked,
    (panel) => !panel || panel === "dual",
    (command) => {
      if (command === "play" && s.clips.length) togglePlay();
      else if (command === "delete" && selected) deleteSelected();
      else if (command === "split" && selected) splitSelected();
      else return false;
      return true;
    },
  );
  useEffect(() => {
    if (!active) {
      setPlaying(false);
      setTrim(null);
    }
  }, [active]);
  useEffect(() => {
    setPlaying(false);
    setTrim((current) =>
      current && retainsTrim(current, s.clips) ? current : null,
    );
    setTime((t) => Math.min(t, Math.max(0, total - 0.001)));
  }, [s.clips, total]);
  useEffect(() => {
    if (!playing) return;
    const start = performance.now(),
      from = time;
    const timer = window.setInterval(() => {
      const next = from + (performance.now() - start) / 1000;
      if (next >= total) {
        setPlaying(false);
        setTime(0);
      } else setTime(next);
    }, 25);
    return () => clearInterval(timer);
    // The playback clock owns time until paused or scrubbed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total]);
  function previewTrim(preview: TrimPreview | null) {
    setPlaying(false);
    setTrim(preview);
    if (preview) setTime(preview.time);
  }
  function scrub(value: number) {
    setTrim(null);
    setPlaying(false);
    setTime(Math.max(0, Math.min(total - 0.00001, value)));
  }
  function viewFrame() {
    if (trim) {
      const source = s.sources.get(trim.source);
      if (source) onFrame(source.file, trim.frame, trim.lane);
      return;
    }
    const clip = s.clips.find((c) => c.id === s.selected);
    if (!clip) return;
    const src = s.sources.get(clip.source)!;
    const at = Math.max(
      clip.start,
      Math.min(time, clip.start + clipDuration(clip, src.engine) - 0.00001),
    );
    onFrame(
      src.file,
      Math.min(
        clip.out - 1,
        sourceFrame(
          src.engine,
          boundary(src.engine, clip.in) + at - clip.start,
        ),
      ),
      clip.lane,
    );
  }
  return (
    <section className="de-timeline" aria-label="Two-track video editor">
      <input
        ref={input}
        type="file"
        className="sr-only"
        accept="video/*,.mp4,.mov,.webm"
        aria-label="Add timeline clips"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length > 1) {
            s.setMessage(
              "Add one source at a time; you can reuse it in as many sections as needed.",
            );
            return;
          }
          if (files[0]) await s.add(files[0], lane.current);
        }}
      />
      <div className="de-timeline-top">
        <div>
          <div className="de-eyebrow">TWO TRACKS / ONE SIMPLE CUT</div>
          <h2>Assemble a teaser</h2>
        </div>
        <div className="de-options">
          {(["A", "B"] as const).map((l) => (
            <button
              className="de-button"
              key={l}
              disabled={
                locked || !slots[l].source || slots[l].source?.codec === "image"
              }
              onClick={() => void s.add(slots[l].source!.file, l)}
            >
              ＋ Add viewer {l}
            </button>
          ))}
          <button
            className="de-button"
            disabled={locked || !s.canUndo}
            onClick={s.undo}
          >
            Undo
          </button>
        </div>
      </div>
      <TimelinePreview
        clips={s.clips}
        sources={s.sources}
        time={time}
        playing={playing}
        trim={trim}
      />
      <div className="de-timeline-transport">
        <PlaybackControls
          playing={playing}
          canPlay={Boolean(total) && !locked}
          toggle={togglePlay}
          rewind={() => scrub(0)}
          canRewind={Boolean(total) && !locked}
          readout={timeLabel(time)}
          total={timeLabel(total)}
        />
        <button
          className="de-button"
          disabled={!selected || locked}
          onClick={viewFrame}
        >
          Edit this frame ↗
        </button>
        <span className="de-eyebrow">
          SPACE PLAY · ⌫ DELETE · C SPLIT · A CUTS OVER B
        </span>
      </div>
      <fieldset disabled={locked} className="de-timeline-body">
        <label className="de-playhead-label">
          Playhead <output>{timeLabel(time)}</output>
          <input
            aria-label="Timeline playhead"
            type="range"
            min="0"
            max={Math.max(total, 0.001)}
            step={1 / 30}
            value={time}
            onChange={(e) => scrub(e.target.valueAsNumber)}
          />
        </label>
        <div className="de-track-ruler">
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i}>{timeLabel((total * i) / 4)}</span>
          ))}
        </div>
        {(["A", "B"] as const).map((l) => (
          <div className="de-track-row" key={l}>
            <button
              className="de-track-title"
              onClick={() => {
                lane.current = l;
                input.current?.click();
              }}
              title={`Open a clip on track ${l}`}
            >
              {l}
              <span>＋</span>
            </button>
            <div
              className="de-track"
              aria-label={`Track ${l}`}
              data-lane={l}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                if (locked) return;
                try {
                  const transfer = e.dataTransfer;
                  const id = transfer.getData("application/x-director-video");
                  const file = shell
                    ? await studioDropFile(
                        transfer,
                        studioStore.getState().director.bundle,
                        shell.library,
                      )
                    : (transfer.files[0] ??
                      (id ? await onAsset(id, l) : undefined));
                  if (file) void s.add(file, l);
                } catch (error) {
                  s.setMessage(String(error));
                }
              }}
            >
              {!s.clips.some((c) => c.lane === l) && (
                <span className="de-track-empty">
                  Drop a video or an asset · click + to browse
                </span>
              )}
              {s.clips
                .filter((c) => c.lane === l)
                .map((c) => {
                  const src = s.sources.get(c.source)!;
                  return (
                    <TimelineClip
                      key={c.id}
                      clip={c}
                      source={src}
                      total={total}
                      selected={c.id === s.selected}
                      onSelect={(time) => {
                        s.select(c.id);
                        scrub(time);
                      }}
                      onChange={(next) => s.update(c.id, next)}
                      onPreview={previewTrim}
                    />
                  );
                })}
              {!!total && (
                <i
                  className="de-track-playhead"
                  style={{ left: `${(100 * time) / total}%` }}
                />
              )}
            </div>
          </div>
        ))}
        <div className="de-cut-actions">
          <button
            className="de-button"
            disabled={!selected}
            onClick={splitSelected}
            aria-keyshortcuts="C S"
          >
            Split at playhead
          </button>
          <button
            className="de-button"
            disabled={!selected}
            onClick={deleteSelected}
            aria-keyshortcuts="Delete Backspace"
          >
            Delete section
          </button>
          <button
            className="de-button"
            disabled={!selected}
            onClick={() => s.trimAt(time, "in")}
          >
            Trim start here
          </button>
          <button
            className="de-button"
            disabled={!selected}
            onClick={() => s.trimAt(time, "out")}
          >
            Trim end here
          </button>
          <button
            className="de-button"
            disabled={!s.clips.length}
            onClick={() => {
              let cursor = 0;
              s.commit(
                [...s.clips]
                  .sort(
                    (a, b) => a.start - b.start || a.lane.localeCompare(b.lane),
                  )
                  .map((c) => {
                    const next = { ...c, start: cursor };
                    cursor += clipDuration(c, s.sources.get(c.source)!.engine);
                    return next;
                  }),
              );
            }}
          >
            Join · close gaps
          </button>
        </div>
        {selected && source && (
          <div className="de-clip-inspector">
            <strong title={source.file.name}>{source.file.name}</strong>
            <label>
              Track
              <ThemedSelect
                aria-label="Selected clip track"
                value={selected.lane}
                onChange={(e) =>
                  s.update(selected.id, { lane: e.target.value as Lane })
                }
              >
                <option>A</option>
                <option>B</option>
              </ThemedSelect>
            </label>
            <label>
              Start · s
              <input
                aria-label="Clip timeline start"
                type="number"
                min="0"
                step={1 / 30}
                value={Number(selected.start.toFixed(4))}
                onChange={(e) =>
                  s.update(selected.id, { start: e.target.valueAsNumber })
                }
              />
            </label>
            <label>
              In · frame
              <input
                aria-label="Clip source in frame"
                type="number"
                min="0"
                max={selected.out - 1}
                value={selected.in}
                onChange={(e) =>
                  s.update(selected.id, { in: e.target.valueAsNumber })
                }
              />
            </label>
            <label>
              Out · exclusive
              <input
                aria-label="Clip source out frame"
                type="number"
                min={selected.in + 1}
                max={source.engine.frames.length}
                value={selected.out}
                onChange={(e) =>
                  s.update(selected.id, { out: e.target.valueAsNumber })
                }
              />
            </label>
            <button
              className="de-button"
              aria-pressed={selected.muted}
              onClick={() => s.update(selected.id, { muted: !selected.muted })}
            >
              {selected.muted ? "Unmute" : "Mute"}
            </button>
          </div>
        )}
      </fieldset>
      <TimelineExport
        session={s}
        onBusy={setExportBusy}
        onStart={() => {
          setTrim(null);
          setPlaying(false);
        }}
      />
      <p className="de-notice" role="status">
        {s.message ||
          "Append clips to either track. A replaces B's picture and sound during overlaps; empty space exports as black and silence."}
      </p>
    </section>
  );
}
