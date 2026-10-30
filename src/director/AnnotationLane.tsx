import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { Layer, Project } from "../../shared/director/types";
import type { EditEdge } from "../../shared/director/timeline";
import { beatGrid, beatLines } from "../../shared/director/beat-grid";
import Icon from "../components/Icon";
import ChannelHeader, { type RowAction } from "./ChannelHeader";
import { SHORT_NAMES, VIEW_NAMES, type View } from "./channel-layout";
import { CHANNEL_COLORS } from "./laneColors";
import type { ViewState } from "./useTimelineView";
import DirectionGlyph, { directionLabel } from "./DirectionGlyph";
import { timecode, type TimeUnits } from "./timecode";

/**
 * A view row drawn from the project, not a layer. Camera and Action project
 * each storyboard shot's directions at the shot's own interval: moving or
 * trimming a cell moves or trims the shot, through the same edit rules, and
 * a locked view blocks both pointer and keyboard edits. Markers and Rhythm
 * follow the composition's notes and beat grid with their own intervals.
 */
export default function AnnotationLane({
  view,
  state,
  project,
  shots,
  width,
  pixels,
  height,
  setHeight,
  units,
  selected,
  disabled,
  actions,
  toggle,
  select,
  seek,
  pick,
  begin,
  move,
  end,
  cancel,
  keyDown,
}: {
  view: View;
  state: ViewState;
  project: Project;
  shots: Layer[];
  width: number;
  pixels: number;
  height: number;
  setHeight: (n: number) => void;
  units: TimeUnits;
  selected: string;
  disabled: boolean;
  actions: RowAction[];
  toggle: (patch: Partial<ViewState>) => void;
  select: (id: string) => void;
  seek: (frame: number) => void;
  pick: (view: "camera" | "action", layer: Layer, anchor: HTMLElement) => void;
  begin: (e: PointerEvent<HTMLElement>, l: Layer, edge: EditEdge) => void;
  move: (e: PointerEvent<HTMLElement>) => void;
  end: (e: PointerEvent<HTMLElement>) => void;
  cancel: () => void;
  keyDown: (e: KeyboardEvent<HTMLElement>, l: Layer) => void;
}) {
  const name = VIEW_NAMES[view];
  const pressed = useRef<number | null>(null);
  const { fps, durationFrames } = project.composition;
  const grid = beatGrid(project.composition);
  const linked = view === "camera" || view === "action";
  const frozen = (l: Layer) => state.locked || l.locked || disabled;
  return (
    <div
      className={`dir-lane dir-view lane-${view} ${state.hidden ? "is-muted" : ""}`}
      data-view={view}
      style={
        {
          "--lane-height": `${height}px`,
          "--lane-color": CHANNEL_COLORS[view],
        } as CSSProperties
      }
    >
      <ChannelHeader
        name={name}
        short={SHORT_NAMES[view]}
        color={CHANNEL_COLORS[view]}
        linked={linked}
        visibility={{
          label: `${state.hidden ? "Show" : "Hide"} ${name}`,
          pressed: state.hidden,
          title:
            "Dims this view in the timeline only; preview and export are unchanged",
          run: () => toggle({ hidden: !state.hidden }),
          icon: <Icon name={state.hidden ? "eyeOff" : "eye"} size={13} />,
        }}
        lock={{
          locked: state.locked,
          run: () => toggle({ locked: !state.locked }),
        }}
        actions={actions}
        height={height}
        setHeight={setHeight}
      />
      <div className="dir-track" style={{ width }}>
        {linked &&
          shots.map((l) => {
            const label = directionLabel(view, l);
            return (
              <div
                key={l.id}
                className={`dir-cell ${l.id === selected ? "is-active" : ""} ${frozen(l) ? "is-locked" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${name} for ${l.name}: ${label ?? "not set"}`}
                aria-haspopup="dialog"
                title={`${label ?? `Choose ${name.toLowerCase()}`} · follows ${l.name}${state.locked ? " · view locked" : ""}`}
                style={{
                  left: l.startFrame * pixels,
                  width: Math.max(1, l.durationFrames * pixels - 2),
                }}
                onPointerDown={(e) => {
                  pressed.current = e.clientX;
                  if (frozen(l)) {
                    e.stopPropagation();
                    select(l.id);
                  } else begin(e, l, "move");
                }}
                onPointerUp={end}
                onPointerMove={move}
                onPointerCancel={cancel}
                onClick={(e) => {
                  const start = pressed.current;
                  pressed.current = null;
                  if (start !== null && Math.abs(e.clientX - start) > 3) return;
                  select(l.id);
                  pick(view, l, e.currentTarget);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(l.id);
                    pick(view, l, e.currentTarget);
                    return;
                  }
                  // A locked view blocks keyboard moves as it blocks drags.
                  if (state.locked && e.key.startsWith("Arrow")) {
                    e.preventDefault();
                    return;
                  }
                  keyDown(e, l);
                }}
              >
                {!frozen(l) && (
                  <span
                    className="dir-trim"
                    onPointerDown={(e) => begin(e, l, "left")}
                    onPointerUp={end}
                    onPointerMove={move}
                  />
                )}
                <DirectionGlyph view={view} layer={l} />
                {!frozen(l) && (
                  <span
                    className="dir-trim right"
                    onPointerDown={(e) => begin(e, l, "right")}
                    onPointerUp={end}
                    onPointerMove={move}
                  />
                )}
              </div>
            );
          })}
        {view === "markers" && (
          <>
            {beatLines(durationFrames, grid).map(({ frame, bar }) => (
              <i
                key={frame}
                className={`dir-beat-mark ${bar ? "bar" : ""}`}
                style={{ left: frame * pixels }}
                aria-hidden="true"
              />
            ))}
            {(project.notes ?? []).map((n) => (
              <button
                key={n.id}
                type="button"
                className={`dir-marker ${n.resolved ? "is-resolved" : ""}`}
                style={{ left: n.frame * pixels }}
                disabled={disabled}
                title={n.text}
                aria-label={`Marker at ${timecode(n.frame, fps, units)}: ${n.text.slice(0, 120)}`}
                onClick={() => {
                  seek(n.frame);
                  if (n.layerId) select(n.layerId);
                }}
              >
                {n.text.slice(0, 18)}
              </button>
            ))}
          </>
        )}
        {view === "rhythm" &&
          bars(durationFrames, grid).map(({ start, end: stop }) => (
            <span
              key={start}
              className="dir-bar"
              style={{
                left: start * pixels,
                width: Math.max(1, (stop - start) * pixels - 2),
              }}
              aria-hidden="true"
            >
              {Array.from({ length: grid.beatsPerBar }, (_, i) => (
                <i key={i} style={{ height: i ? "45%" : "90%" }} />
              ))}
            </span>
          ))}
      </div>
    </div>
  );
}

/** Each bar's interval, from one downbeat to the next or the end. */
function bars(durationFrames: number, grid: ReturnType<typeof beatGrid>) {
  const downbeats = beatLines(durationFrames, grid)
    .filter((b) => b.bar)
    .map((b) => b.frame);
  return downbeats.map((start, i) => ({
    start,
    end: Math.min(durationFrames, downbeats[i + 1] ?? durationFrames),
  }));
}
