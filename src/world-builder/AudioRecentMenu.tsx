/**
 * The transport's Recent menu, and the Audio assets list below the scopes:
 * the same tracks (this browser's recent audio, then the project's), picked
 * with a click or dragged onto the scene, forgotten with the bin.
 *
 * Ported from Holodeck's AudioRecentMenu and AudioAssets
 * (src/components/audio/, MIT; notice in Holodeck-LICENSE.txt).
 */
import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import {
  RECENT_AUDIO_DRAG,
  type AudioSource,
  type RecentAudio,
} from "./audio-history";
import { inComfyNode } from "./host";

const sourceNames: Record<AudioSource, string> = {
  file: "File",
  drop: "Dropped",
  comfy: "Comfy",
  agent: "Agent",
  project: "Project",
  take: "Take",
  example: "Example",
};
/** A row's source tag. Inside Comfy, audio from the graph says so. */
export function sourceName(source: AudioSource, comfy = inComfyNode()) {
  return comfy && source === "comfy" ? "Graph output" : sourceNames[source];
}
export const megabytes = (bytes: number) =>
  `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`;

export interface TrackActions {
  pick(item: RecentAudio): void;
  /** Project audio belongs to the project and is not forgotten here. */
  forget(item: RecentAudio): void;
}

export function TrackList({
  tracks,
  current,
  actions,
  label,
}: {
  tracks: RecentAudio[];
  /** The loaded track's name, to mark its row. */
  current: string;
  actions: TrackActions;
  label: string;
}) {
  if (!tracks.length)
    return (
      <p className="wb-hint">
        {inComfyNode()
          ? "No graph audio yet. Run a graph with SaveAudio, PreviewAudio or World Builder · Inputs and its audio is listed here."
          : "No recent tracks yet."}
      </p>
    );
  return (
    <ul className="wb-recent-audio" aria-label={label}>
      {tracks.map((item) => (
        <li
          key={item.id}
          draggable
          data-current={item.label === current}
          title="Click to load and play, or drag onto the scene"
          onDragStart={(ev) => {
            ev.dataTransfer.effectAllowed = "copy";
            ev.dataTransfer.setData(RECENT_AUDIO_DRAG, item.id);
          }}
        >
          <button type="button" onClick={() => actions.pick(item)}>
            <span>{item.label}</span>
            <small>
              {sourceName(item.source)} · {megabytes(item.bytes)}
            </small>
          </button>
          {item.source !== "project" && (
            <button
              type="button"
              className="wb-icon-button"
              aria-label={`Forget ${item.label}`}
              title="Forget this track in this browser"
              onClick={() => actions.forget(item)}
            >
              <Icon name="trash" size={13} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AudioRecentMenu({
  tracks,
  current,
  actions,
}: {
  tracks: RecentAudio[];
  current: string;
  actions: TrackActions;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Close on a click elsewhere, in whichever window holds the panel.
  useEffect(() => {
    const doc = root.current?.ownerDocument;
    if (!open || !doc) return;
    const away = (ev: PointerEvent) => {
      if (!root.current?.contains(ev.target as Node)) setOpen(false);
    };
    doc.addEventListener("pointerdown", away);
    return () => doc.removeEventListener("pointerdown", away);
  }, [open]);
  return (
    <div
      className="wb-recent-menu"
      ref={root}
      onKeyDown={(ev) => {
        if (ev.key === "Escape" && open) {
          ev.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="wb-icon-button"
        aria-label="Recent audio"
        aria-expanded={open}
        title="Recent audio"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="history" size={14} />
      </button>
      {open && (
        <div className="wb-recent-popover">
          <TrackList
            tracks={tracks}
            current={current}
            label="Recent audio tracks"
            actions={{
              pick(item) {
                setOpen(false);
                actions.pick(item);
              },
              forget: actions.forget,
            }}
          />
        </div>
      )}
    </div>
  );
}
