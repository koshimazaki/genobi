import BoundaryPreview from "./BoundaryPreview";
import type { TrimPreview } from "./trim-preview";
import { useEffect, useRef } from "react";
import { activeClip, boundary, type EditClip } from "./timeline-model";
import type { TimelineSource } from "./timeline-export";

export default function TimelinePreview({
  clips,
  sources,
  time,
  playing,
  trim,
}: {
  clips: EditClip[];
  sources: Map<string, TimelineSource>;
  time: number;
  playing: boolean;
  trim: TrimPreview | null;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const timing = new Map([...sources].map(([id, s]) => [id, s.engine]));
  const clip = activeClip(clips, timing, time),
    source = clip ? sources.get(clip.source) : undefined;
  const at =
    clip && source ? boundary(source.engine, clip.in) + time - clip.start : 0;
  const trimmed = trim ? sources.get(trim.source) : undefined;
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (trim || !source || !clip) {
      element.pause();
      return;
    }
    const sync = () => {
      if (Math.abs(element.currentTime - at) > (playing ? 0.09 : 0.005))
        element.currentTime = at;
      element.muted = clip.muted;
      if (playing) void element.play().catch(() => {});
      else element.pause();
    };
    sync();
    element.addEventListener("loadedmetadata", sync);
    return () => element.removeEventListener("loadedmetadata", sync);
  }, [source, clip, at, playing, trim]);
  return (
    <div className="de-timeline-preview">
      <video
        ref={video}
        src={source?.url}
        playsInline
        preload="auto"
        aria-label="Timeline program preview"
        style={{ visibility: source && !trim ? "visible" : "hidden" }}
      />
      {trim && trimmed && (
        <BoundaryPreview source={trimmed} frame={trim.frame} />
      )}
      {!source && !trim && (
        <span>
          {clips.length
            ? "Gap · black / silence"
            : "Your next cut starts here."}
        </span>
      )}
      <span className="de-program-label">
        {trim
          ? `${trim.edge === "out" ? "TRIM END" : trim.edge === "in" ? "TRIM START" : "MOVE"} / ${trim.lane} · SOURCE FRAME ${trim.frame}`
          : `PROGRAM / ${clip?.lane ?? "—"}`}
      </span>
    </div>
  );
}
