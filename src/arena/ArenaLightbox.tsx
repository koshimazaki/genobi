import { useEffect, useRef, useState } from "react";
import { arenaMediaUrl, type Arena, type ArenaSlot } from "../../shared/arena";
import Icon from "../components/Icon";
import { openModal } from "../components/useModalDialog";
import { useArenaPlayback } from "./useArenaPlayback";
import ArenaTransport from "./ArenaTransport";
import { useWindowFrame } from "./useWindowFrame";
import "./arena-lightbox.css";

export default function ArenaLightbox({
  arena,
  slots,
  title,
  initialTime,
  onClose,
}: {
  arena: Arena;
  slots: ArenaSlot[];
  title: string;
  initialTime: number;
  onClose: (time: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const playback = useArenaPlayback(
    true,
    `${arena.id}:${slots.map((s) => s.id).join()}`,
    initialTime,
  );
  const [audio, setAudio] = useState<string>();
  const [error, setError] = useState("");
  const win = useWindowFrame();
  const close = () => {
    playback.pause();
    onClose(playback.time);
  };
  useEffect(() => {
    const previous = document.body.style.overflow;
    const dispose = openModal(dialog.current);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      dispose();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="arena arena-lightbox"
      data-compact={win.compact || undefined}
      style={
        win.compact
          ? undefined
          : {
              left: win.frame.x,
              top: win.frame.y,
              width: win.frame.width,
              height: win.frame.height,
            }
      }
      aria-label={`${title} enlarged`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="arena-lightbox-content">
        <header
          className="arena-heading arena-window-bar"
          {...win.handle("move")}
        >
          <div>
            <span className="section-eyebrow">ARENA / REVIEW</span>
            <h2>{title}</h2>
          </div>
          <div className="arena-actions">
            {!win.compact && (
              <>
                <button
                  className="arena-window-move"
                  aria-label="Move window. Drag, or use the arrow keys; Shift moves further."
                  title="Move window (drag or arrow keys)"
                  {...win.handle("move")}
                >
                  <Icon name="grid" size={14} />
                </button>
                <button onClick={win.reset}>Reset size</button>
              </>
            )}
            <button onClick={close} aria-label="Close enlarged comparison">
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>
        <div className="arena-lightbox-grid" data-count={slots.length}>
          {slots.map((slot) => {
            const media = arena.media.find((m) => m.hash === slot.media);
            return (
              <figure key={slot.id}>
                <figcaption>
                  {slot.label}
                  <span>{slot.model}</span>
                  {media?.kind === "video" && (
                    <button
                      aria-label={`${playback.soloing === slot.id ? "Pause" : "Play"} ${slot.label} alone`}
                      aria-pressed={playback.soloing === slot.id}
                      onClick={() => void playback.solo(slot.id)}
                    >
                      <Icon
                        name={playback.soloing === slot.id ? "pause" : "play"}
                        size={12}
                      />
                      {playback.soloing === slot.id ? "Pause" : "Play alone"}
                    </button>
                  )}
                </figcaption>
                <div className="arena-screen">
                  {media?.kind === "image" ? (
                    <img
                      src={arenaMediaUrl(arena.id, media.hash)}
                      alt={`${slot.label} result`}
                    />
                  ) : media ? (
                    <video
                      src={arenaMediaUrl(arena.id, media.hash)}
                      aria-label={`${slot.label} enlarged result`}
                      ref={(video) => {
                        if (video) playback.videos.current.set(slot.id, video);
                        else playback.videos.current.delete(slot.id);
                      }}
                      playsInline
                      muted={audio !== slot.id}
                      preload="auto"
                      onLoadedMetadata={(event) => {
                        event.currentTarget.currentTime = Math.min(
                          initialTime,
                          event.currentTarget.duration,
                        );
                        playback.loaded();
                      }}
                      onError={() => setError(`${slot.label} could not load.`)}
                    />
                  ) : (
                    <p className="arena-lightbox-empty">No result yet</p>
                  )}
                  {media?.kind === "video" && (
                    <button
                      className="arena-audio"
                      aria-label={`${audio === slot.id ? "Mute" : "Listen to"} ${slot.label}`}
                      aria-pressed={audio === slot.id}
                      onClick={() =>
                        setAudio(audio === slot.id ? undefined : slot.id)
                      }
                    >
                      <Icon
                        name={audio === slot.id ? "sound" : "mute"}
                        size={16}
                      />
                    </button>
                  )}
                </div>
              </figure>
            );
          })}
        </div>
        <ArenaTransport playback={playback} />
        {(error || playback.error) && (
          <p role="alert">{error || playback.error}</p>
        )}
      </div>
      {!win.compact && (
        <button
          className="arena-window-resize"
          aria-label="Resize window. Drag, or use the arrow keys; Shift resizes further."
          title="Resize window (drag or arrow keys)"
          {...win.handle("resize")}
        >
          <Icon name="expand" size={12} />
        </button>
      )}
    </dialog>
  );
}
