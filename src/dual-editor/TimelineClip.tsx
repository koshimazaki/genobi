import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { trimPreview, type TrimPreview } from "./trim-preview";
import { dragClip, type ClipDrag } from "./clip-drag";
import {
  boundary,
  clipDuration,
  type EditClip,
  type Lane,
} from "./timeline-model";
import type { TimelineSource } from "./timeline-export";
import { timeLabel } from "./frame-math";

export default function TimelineClip({
  clip,
  source,
  total,
  selected,
  onSelect,
  onChange,
  onPreview,
}: {
  clip: EditClip;
  source: TimelineSource;
  total: number;
  selected: boolean;
  onSelect: (time: number) => void;
  onChange: (clip: EditClip) => boolean;
  onPreview: (preview: TrimPreview | null) => void;
}) {
  const [draft, setDraft] = useState<EditClip | null>(null);
  const suppressClick = useRef(false);
  const drag = useRef<{
    kind: ClipDrag;
    x: number;
    scale: number;
    moved: boolean;
    clip: EditClip;
  } | null>(null);
  const displayed = draft ?? clip,
    length = clipDuration(displayed, source.engine);
  function down(e: PointerEvent<HTMLButtonElement>, kind: ClipDrag) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const track = e.currentTarget.closest<HTMLElement>(".de-track")!;
    drag.current = {
      kind,
      x: e.clientX,
      scale: total / track.getBoundingClientRect().width,
      moved: false,
      clip,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    suppressClick.current = false;
    onSelect(clip.start);
    onPreview(trimPreview(clip, source.engine, kind));
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    let lane = clip.lane;
    if (d.kind === "move")
      for (const row of e.currentTarget
        .closest(".de-timeline-body")!
        .querySelectorAll<HTMLElement>(".de-track")) {
        const rect = row.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom)
          lane = row.dataset.lane as Lane;
      }
    if (Math.abs(e.clientX - d.x) > 2 || lane !== clip.lane) d.moved = true;
    d.clip = dragClip(
      clip,
      source.engine,
      d.kind,
      (e.clientX - d.x) * d.scale,
      lane,
    );
    setDraft(d.clip);
    onPreview(trimPreview(d.clip, source.engine, d.kind));
  }
  function up(e: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    suppressClick.current = drag.current.moved;
    if (drag.current.moved && !onChange(drag.current.clip)) onPreview(null);
    drag.current = null;
    setDraft(null);
  }
  function key(e: KeyboardEvent<HTMLButtonElement>, kind: ClipDrag) {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code) ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      return;
    e.preventDefault();
    let next: EditClip;
    if (kind === "move")
      next = dragClip(
        clip,
        source.engine,
        kind,
        e.code === "ArrowLeft" ? -1 / 30 : e.code === "ArrowRight" ? 1 / 30 : 0,
        e.code === "ArrowUp" ? "A" : e.code === "ArrowDown" ? "B" : clip.lane,
      );
    else {
      if (e.code !== "ArrowLeft" && e.code !== "ArrowRight") return;
      const index = kind === "in" ? clip.in : clip.out;
      const target = Math.max(
        0,
        Math.min(
          source.engine.frames.length,
          index + (e.code === "ArrowLeft" ? -1 : 1),
        ),
      );
      next = dragClip(
        clip,
        source.engine,
        kind,
        boundaryAt(target) - boundaryAt(index),
      );
    }
    if (onChange(next)) onPreview(trimPreview(next, source.engine, kind));
    else onPreview(null);
  }
  function boundaryAt(index: number) {
    return boundary(source.engine, index);
  }
  const bindings = (kind: ClipDrag) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => down(e, kind),
    onPointerMove: move,
    onPointerUp: up,
    onPointerCancel: () => {
      drag.current = null;
      setDraft(null);
      onPreview(null);
    },
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => key(e, kind),
  });
  return (
    <div
      className={`de-clip-shell ${draft ? "de-clip-shell--drag" : ""}`}
      style={{
        left: `${(100 * displayed.start) / total}%`,
        width: `${(100 * length) / total}%`,
        transform:
          displayed.lane !== clip.lane
            ? `translateY(${clip.lane === "A" ? 84 : -84}px)`
            : undefined,
      }}
    >
      <button
        {...bindings("move")}
        className="de-timeline-clip"
        aria-pressed={selected}
        aria-label={`${source.file.name}, track ${clip.lane}, start ${timeLabel(clip.start)}`}
        title="Drag to move · drag vertically to change track · arrow keys nudge"
        style={{
          backgroundImage: `linear-gradient(0deg,#000b,#0003),url("${source.thumb}")`,
        }}
        onClick={() => {
          if (!suppressClick.current) onSelect(clip.start);
          suppressClick.current = false;
        }}
      >
        <strong>{source.file.name}</strong>
        <span>
          {timeLabel(length)} {clip.muted ? "· muted" : ""}
        </span>
      </button>
      <button
        {...bindings("in")}
        className="de-clip-edge de-clip-edge--in"
        aria-label={`Trim start of ${source.file.name}`}
        title="Drag to trim start · arrow keys trim one source frame"
      />
      <button
        {...bindings("out")}
        className="de-clip-edge de-clip-edge--out"
        aria-label={`Trim end of ${source.file.name}`}
        title="Drag to trim end · arrow keys trim one source frame"
      />
    </div>
  );
}
