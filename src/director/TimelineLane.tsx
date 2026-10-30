import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import type { Layer, Project } from "../../shared/director/types";
import type { EditEdge } from "../../shared/director/timeline";
import type { Lane } from "../../shared/director/tracks";
import Icon from "../components/Icon";
import type { Ghost } from "./useClipDrag";
import { useStudio } from "../studio/useStudio";
import ChannelHeader, { type RowAction } from "./ChannelHeader";
import { SHORT_NAMES } from "./channel-layout";
import { CHANNEL_COLORS } from "./laneColors";
import ShotCell from "./ShotCell";

const ICONS = {
  audio: "sound",
  video: "film",
  image: "image",
  graphics: "graphics",
  filter: "filter",
} as const;

export default function TimelineLane({
  lane,
  label,
  project,
  width,
  pixels,
  height,
  setHeight,
  storyboard,
  selected,
  matched,
  ghost,
  disabled,
  waveforms,
  actions,
  select,
  inspect,
  mute,
  lock,
  openShot,
  begin,
  move,
  end,
  cancel,
  keyDown,
}: {
  lane: Lane;
  label: string;
  project: Project;
  width: number;
  pixels: number;
  height: number;
  setHeight: (n: number) => void;
  /** This lane holds the storyboard shots: thumbnails, codes and directions. */
  storyboard: boolean;
  selected: string;
  matched: Set<string>;
  ghost: Ghost | null;
  disabled: boolean;
  waveforms: Record<string, number[]>;
  actions: RowAction[];
  select: (id: string) => void;
  inspect: () => void;
  mute: (muted: boolean) => void;
  lock: (locked: boolean) => void;
  openShot?: (layer: Layer, anchor: HTMLElement) => void;
  begin: (e: PointerEvent<HTMLElement>, l: Layer, edge: EditEdge) => void;
  move: (e: PointerEvent<HTMLElement>) => void;
  end: (e: PointerEvent<HTMLElement>) => void;
  cancel: () => void;
  keyDown: (e: KeyboardEvent<HTMLElement>, l: Layer) => void;
}) {
  // Clips of the selected asset are outlined, so a card leads to its clips.
  const sourceAsset = useStudio((s) => s.workspace.assetSelection);
  const single = lane.layers.length === 1 ? lane.layers[0] : undefined;
  const head = lane.layers.find((l) => l.id === selected) ?? lane.layers[0];
  const name = single?.name ?? `${lane.layers.length} clips`;
  const muted = lane.layers.every((l) => l.muted),
    locked = lane.layers.every((l) => l.locked);
  const x = (frames: number) => frames * pixels;
  // A clip dragged in from another lane is drawn here as a ghost.
  const incoming =
    ghost?.lane === lane.id && !lane.layers.some((l) => l.id === ghost.id)
      ? project.layers.find((l) => l.id === ghost.id)
      : undefined;
  const audio = head.kind === "audio";
  return (
    <div
      className={`dir-lane lane-${storyboard ? "storyboard" : head.kind} ${lane.layers.some((l) => l.id === selected) ? "is-selected" : ""} ${muted ? "is-muted" : ""}`}
      data-lane={lane.id}
      style={{ "--lane-height": `${height}px` } as CSSProperties}
    >
      <ChannelHeader
        name={storyboard ? `Storyboard · ${name}` : name}
        short={storyboard ? "Story" : SHORT_NAMES[head.kind]}
        tag={label}
        color={storyboard ? "var(--intel)" : CHANNEL_COLORS[head.kind]}
        select={{
          run: () => select(head.id),
          inspect: () => {
            select(head.id);
            inspect();
          },
        }}
        selectLabel={`Select track ${name}`}
        visibility={{
          label: `${audio ? (muted ? "Unmute" : "Mute") : muted ? "Show" : "Hide"} ${name}`,
          pressed: muted,
          disabled,
          title: audio
            ? "Mute audio in preview and export"
            : `${muted ? "Show" : "Hide"} ${head.kind} in preview and export`,
          run: () => mute(!muted),
          icon: (
            <>
              <Icon
                name={audio && muted ? "mute" : ICONS[head.kind]}
                size={13}
              />
              {muted && !audio && (
                <i className="dir-hidden-slash" aria-hidden="true" />
              )}
            </>
          ),
        }}
        lock={{ locked, disabled, run: () => lock(!locked) }}
        actions={actions}
        height={height}
        setHeight={setHeight}
      />
      <div className="dir-track" style={{ width }}>
        {lane.layers.map((l, index) => {
          const mine = ghost?.id === l.id,
            here = mine && ghost.lane === lane.id;
          return (
            <div
              key={l.id}
              className={`dir-clip ${l.kind} ${storyboard ? "is-shot" : ""} ${matched.has(l.id) ? "is-aligned" : ""} ${l.id === selected ? "is-active" : ""} ${sourceAsset && "assetId" in l && l.assetId === sourceAsset ? "is-source" : ""} ${mine && !here ? "is-lifting" : ""} ${l.muted ? "is-off" : ""} ${l.locked ? "is-locked" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={`Select ${l.name}`}
              aria-pressed={selected === l.id}
              data-layer-id={l.id}
              onDoubleClick={() => {
                select(l.id);
                inspect();
              }}
              style={{
                left: x(
                  here
                    ? (ghost.patch.startFrame ?? l.startFrame)
                    : l.startFrame,
                ),
                width: Math.max(
                  1,
                  x(
                    here
                      ? (ghost.patch.durationFrames ?? l.durationFrames)
                      : l.durationFrames,
                  ),
                ),
              }}
              onPointerDown={(e) => begin(e, l, "move")}
              onPointerUp={end}
              onPointerMove={move}
              onPointerCancel={cancel}
              onKeyDown={(e) => keyDown(e, l)}
            >
              <span
                className="dir-trim"
                onPointerDown={(e) => begin(e, l, "left")}
                onPointerUp={end}
                onPointerMove={move}
              />
              {storyboard ? (
                <ShotCell
                  layer={l}
                  index={index}
                  project={project}
                  open={openShot}
                />
              ) : (
                <span>{l.name}</span>
              )}
              {waveforms[l.id] && (
                <svg
                  className="dir-waveform"
                  viewBox="0 0 128 32"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d={waveforms[l.id]
                      .map((v, i) => `M${i},${16 - v * 15}v${v * 30}`)
                      .join(" ")}
                  />
                </svg>
              )}
              {!storyboard && (
                <small>
                  {l.kind === "graphics"
                    ? project.modules[l.moduleId].engine
                    : l.kind}
                </small>
              )}
              <span
                className="dir-trim right"
                onPointerDown={(e) => begin(e, l, "right")}
                onPointerUp={end}
                onPointerMove={move}
              />
            </div>
          );
        })}
        {incoming && ghost && (
          <div
            className={`dir-clip-ghost ${incoming.kind} ${ghost.fits ? "" : "is-blocked"}`}
            aria-hidden="true"
            style={{
              left: x(ghost.patch.startFrame ?? ghost.raw),
              width: Math.max(1, x(incoming.durationFrames)),
            }}
          >
            <span>{ghost.fits ? incoming.name : "No room on this track"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
