// Adapted to the bundle model from Holo's ruler/lane/clip-card composition and
// the Editor timeline design (#178): one origin for the playhead row, ruler,
// grid, clips and playhead; a resizable channel column; storyboard shots with
// linked Camera and Action views. Selection, pointer capture, edge trims,
// locks and the sticky lane gutter are unchanged.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import type { Layer, Project } from "../../shared/director/types";
import TimelineGrid from "./TimelineGrid";
import TimelineLane from "./TimelineLane";
import TimelineRuler from "./TimelineRuler";
import AnnotationLane from "./AnnotationLane";
import CompositionEnd from "./CompositionEnd";
import ResizeHandle from "../components/ResizeHandle";
import { alignedEdges, timelinePatch } from "../../shared/director/timeline";
import {
  fitStart,
  laneId,
  laneLabels,
  lanes,
} from "../../shared/director/tracks";
import {
  beatGrid,
  nudgeFrame,
  type SnapGrid,
} from "../../shared/director/beat-grid";
import { NEW_LANE, useClipDrag } from "./useClipDrag";
import type { TrimRequest } from "./useTrimPreview";
import { timecode, type TimeUnits } from "./timecode";
import { useTimelineDrop } from "./useTimelineDrop";
import { CHANNEL_WIDTH, density, storyboardLane } from "./channel-layout";
import { useTimelineRows } from "./useTimelineRows";
import DirectionPopover, { type DirectionPick } from "./DirectionPopover";
import type { DirectionsPatch } from "../../shared/director/directions";

interface Props {
  collapsed: boolean;
  expanded: boolean;
  units: TimeUnits;
  inspect: () => void;
  drop: (files: File[]) => void;
  project: Project;
  frame: number;
  selected: string;
  select: (id: string) => void;
  seek: (f: number) => Promise<void> | void;
  edit: (id: string, patch: Partial<Layer>) => void;
  retrack: (id: string, startFrame: number, lane: string) => void;
  changeList: (layers: Layer[]) => void;
  preview: (r: TrimRequest | null) => void;
  pixels: number;
  snap: SnapGrid;
  magnet: boolean;
  disabled: boolean;
  waveforms: Record<string, number[]>;
  channelWidth: number;
  setChannelWidth: (n: number) => void;
  /** The lanes' visible width, for Fit all. */
  measure: (width: number) => void;
  setDuration: (frames: number) => void;
  /** Runs a Director command; returns the refusal, or "". */
  command: (command: unknown) => string;
  report: (e: unknown) => void;
}
export default function Timeline(p: Props) {
  const { project, pixels, frame, selected, select, disabled } = p;
  const { fps, durationFrames } = project.composition,
    width = durationFrames * pixels,
    [frameWidth, setFrameWidth] = useState(0),
    // The column keeps at most about a third of a narrow timeline (phones).
    gutter = p.collapsed
      ? CHANNEL_WIDTH.folded
      : frameWidth
        ? Math.min(
            p.channelWidth,
            Math.max(CHANNEL_WIDTH.min, Math.round(frameWidth * 0.3)),
          )
        : p.channelWidth;
  const scroller = useRef<HTMLDivElement>(null);
  const {
    error: dropError,
    onDragOver,
    onDrop,
  } = useTimelineDrop({
    disabled,
    frame,
    drop: p.drop,
  });
  const [showAlignment, setShowAlignment] = useState(false);
  const [pick, setPick] = useState<DirectionPick | null>(null);
  const closePick = useCallback(() => setPick(null), []);
  const drag = useClipDrag({
    project,
    pixels,
    snap: p.snap,
    magnet: p.magnet,
    disabled,
    select,
    aligned: () => setShowAlignment(true),
    edit: p.edit,
    retrack: p.retrack,
    preview: p.preview,
  });
  const { ghost } = drag;
  const { measure } = p;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const report = () => {
      setFrameWidth(el.clientWidth);
      measure(Math.max(0, el.clientWidth - gutter - 18));
    };
    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();
    return () => observer.disconnect();
  }, [gutter, measure]);
  // Top of the list is top of the stack.
  const stack = lanes(project.layers),
    labels = laneLabels(stack),
    rows = [...stack].reverse(),
    story = storyboardLane(stack);
  const layout = useTimelineRows({
    project,
    rows,
    story,
    expanded: p.expanded,
    disabled,
    select,
    changeList: p.changeList,
    report: p.report,
  });
  const selectedLayer = project.layers.find((l) => l.id === selected);
  const guides =
    showAlignment && selectedLayer
      ? alignedEdges(
          project.layers,
          ghost?.id === selected
            ? ({ ...selectedLayer, ...ghost.patch } as Layer)
            : selectedLayer,
        )
      : [];
  const matched = new Set(guides.flatMap((g) => g.ids));
  /** Alt+Up/Down: the next lane of the same family with room, else a new top track. */
  function shiftLane(l: Layer, direction: 1 | -1) {
    const own = rows.findIndex((r) => r.id === laneId(l)),
      family = rows[own].family;
    for (let i = own - direction; i >= 0 && i < rows.length; i -= direction) {
      if (rows[i].family !== family) continue;
      const start = fitStart(
        project.layers,
        rows[i].id,
        l.id,
        l.durationFrames,
        l.startFrame,
        0,
        durationFrames - l.durationFrames,
      );
      if (start !== undefined) return p.retrack(l.id, start, rows[i].id);
    }
    if (direction > 0) p.retrack(l.id, l.startFrame, "new");
  }
  function keyDown(e: KeyboardEvent<HTMLElement>, l: Layer) {
    if (e.key === "Enter") {
      e.preventDefault();
      select(l.id);
    }
    if (disabled || l.locked) return;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      shiftLane(l, e.key === "ArrowUp" ? 1 : -1);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const direction = e.key === "ArrowLeft" ? -1 : 1;
      const target = nudgeFrame(l.startFrame, p.snap, direction);
      const patch = timelinePatch(
        project,
        l,
        "move",
        target - l.startFrame,
        p.snap,
        0,
      );
      if (patch.startFrame !== undefined) p.edit(l.id, patch);
      setShowAlignment(true);
    }
  }
  const clipHandlers = {
    begin: drag.begin,
    move: drag.move,
    end: drag.end,
    cancel: drag.cancel,
    keyDown,
  };
  const dots = density(gutter) === "dots";
  const picked = pick && project.layers.find((l) => l.id === pick.layer);
  return (
    <div
      className="dir-timeline-frame"
      style={{ "--dir-gutter": `${gutter}px` } as CSSProperties}
    >
      <div
        ref={scroller}
        className={`dir-timeline ${p.collapsed ? "channels-folded" : ""} ${p.expanded ? "is-expanded" : ""} ${drag.dragging ? "is-dragging" : ""}`}
        aria-label="Composition timeline"
        data-density={density(gutter)}
        style={{ "--dir-gutter": `${gutter}px` } as CSSProperties}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {dropError && <p role="alert">{dropError}</p>}
        <div
          className="dir-timeline-inner"
          style={{ width: `calc(${width}px + var(--dir-gutter) + 18px)` }}
        >
          <TimelineGrid
            gutter={gutter}
            durationFrames={durationFrames}
            fps={fps}
            pixels={pixels}
            grid={beatGrid(project.composition)}
          />
          <TimelineRuler
            project={project}
            frame={frame}
            pixels={pixels}
            units={p.units}
            dots={dots}
            disabled={disabled}
            seek={p.seek}
            select={select}
            dragging={drag.dragging}
            newTrackTarget={ghost?.lane === NEW_LANE}
          />
          {layout.order.map((key) => {
            const row = layout.row(key);
            if (row.view)
              return (
                <AnnotationLane
                  key={key}
                  view={row.view}
                  state={layout.views[row.view]}
                  project={project}
                  shots={story?.layers ?? []}
                  width={width}
                  pixels={pixels}
                  height={row.height}
                  setHeight={row.setHeight}
                  units={p.units}
                  selected={selected}
                  disabled={disabled}
                  actions={row.actions}
                  toggle={(patch) => layout.view(row.view!, patch)}
                  select={select}
                  seek={(f) => void p.seek(f)}
                  pick={(view, layer, anchor) =>
                    setPick({ view, layer: layer.id, anchor })
                  }
                  {...clipHandlers}
                />
              );
            const lane = row.lane!;
            return (
              <TimelineLane
                key={key}
                lane={lane}
                label={labels.get(lane.id)!}
                project={project}
                width={width}
                pixels={pixels}
                height={row.height}
                setHeight={row.setHeight}
                storyboard={lane.id === story?.id}
                selected={selected}
                matched={matched}
                ghost={ghost}
                disabled={disabled}
                waveforms={p.waveforms}
                actions={row.actions}
                select={(id) => {
                  select(id);
                  setShowAlignment(true);
                }}
                inspect={p.inspect}
                mute={(muted) => layout.setLane(lane.id, { muted })}
                lock={(locked) => layout.setLane(lane.id, { locked })}
                openShot={(layer, anchor) =>
                  setPick({ view: "shot", layer: layer.id, anchor })
                }
                {...clipHandlers}
              />
            );
          })}
          {guides.map((g) => (
            <div
              key={g.frame}
              className="dir-align-guide"
              style={{
                left: `calc(var(--dir-gutter) + ${g.frame * pixels}px)`,
              }}
              data-frame={g.frame}
            >
              <span>{timecode(g.frame, fps, p.units)} · aligned</span>
            </div>
          ))}
          <div
            className="dir-playhead"
            style={{ left: `calc(var(--dir-gutter) + ${frame * pixels}px)` }}
          >
            <i />
          </div>
          <CompositionEnd
            project={project}
            pixels={pixels}
            disabled={disabled}
            setDuration={p.setDuration}
          />
        </div>
      </div>
      {picked && pick && (
        <DirectionPopover
          pick={pick}
          layer={picked}
          index={story?.layers.indexOf(picked) ?? 0}
          locked={
            disabled ||
            picked.locked ||
            (pick.view !== "shot" && layout.views[pick.view].locked)
          }
          apply={(directions: DirectionsPatch) =>
            p.command({
              op: "set-clip-directions",
              layerId: picked.id,
              directions,
            })
          }
          close={closePick}
        />
      )}
      <footer className="dir-timeline-foot">
        <span>
          <i aria-hidden="true" />
          {selectedLayer
            ? `${selectedLayer.name} · ${timecode(selectedLayer.startFrame, fps, p.units)}–${timecode(selectedLayer.startFrame + selectedLayer.durationFrames, fps, p.units)}`
            : "Select a clip"}
        </span>
        {layout.removedViews.length > 0 && (
          <span className="dir-restore-views">
            Restore view:
            {layout.removedViews.map((v) => (
              <button key={v} type="button" onClick={() => layout.restore(v)}>
                {layout.viewName(v)}
              </button>
            ))}
          </span>
        )}
        <span className="dir-foot-hint">
          Drag to move · edges trim · Space plays · Delete removes
        </span>
      </footer>
      <div className="dir-channel-divider">
        <ResizeHandle
          label="Channel column width"
          value={gutter}
          min={CHANNEL_WIDTH.min}
          max={CHANNEL_WIDTH.max}
          change={p.setChannelWidth}
        />
      </div>
    </div>
  );
}
