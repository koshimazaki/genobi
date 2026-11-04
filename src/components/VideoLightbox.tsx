import { imageExtension } from "../image-download";
import { useEffect, useRef, useState } from "react";
import AudioTake from "./AudioTake";
import Icon from "./Icon";
import ModelTag from "./ModelTag";
export interface ViewingClip {
  url: string;
  mediaType?: "image" | "video" | "audio";
  contentType?: string;
  label: string;
  prompt?: string;
  /** A catalogue clip's provenance line, shown when it has no saved prompt. */
  about?: string;
  /** Which model made the clip, as the gallery card tags it. */
  signature?: { tag: string; title: string };
  /** The download's file name, when the clip has its own (a project asset). */
  filename?: string;
  /** The text section's heading; "Prompt" unless the clip says otherwise. */
  heading?: string;
}
/** Previous / next through a collection; arrow keys step as the buttons do. */
export interface LightboxNav {
  position: string;
  onStep: (offset: 1 | -1) => void;
}
const PREVIEW = { image: "Image", video: "Video", audio: "Audio" } as const;
export default function VideoLightbox({
  clip,
  onClose,
  nav,
  onMeasure,
}: {
  clip: ViewingClip | null;
  onClose: () => void;
  nav?: LightboxNav;
  /** The media's own pixel size, once it has loaded. */
  onMeasure?: (width: number, height: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setCopyStatus("");
    if (!clip) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.querySelectorAll("video").forEach((item) => item.pause());
    const box = dialog.current;
    const player = video.current;
    box?.showModal();
    document.body.style.overflow = "hidden";
    void player?.play().catch(() => {});
    return () => {
      player?.pause();
      box?.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
    // Keyed by the media, so a caption that fills in later (a measured size)
    // does not reopen the dialog or restart the clip.
  }, [clip?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!clip) return null;
  const kind = clip.mediaType ?? "video";
  return (
    <dialog
      ref={dialog}
      className="video-lightbox"
      aria-label={clip.label}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (!nav || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
        // A focused player or field keeps its own arrow keys (seek, caret).
        if ((e.target as Element).closest("video,audio,input,textarea")) return;
        e.preventDefault();
        nav.onStep(e.key === "ArrowRight" ? 1 : -1);
      }}
    >
      <div className="lightbox-content">
        <header>
          <span>
            {PREVIEW[kind]} preview
            {clip.signature && <ModelTag {...clip.signature} />}
          </span>
          {nav && (
            <span className="lightbox-nav">
              <button
                className="icon-button"
                aria-label="Previous"
                onClick={() => nav.onStep(-1)}
              >
                <Icon name="fold" />
              </button>
              <span aria-live="polite">{nav.position}</span>
              <button
                className="icon-button lightbox-next"
                aria-label="Next"
                onClick={() => nav.onStep(1)}
              >
                <Icon name="fold" />
              </button>
            </span>
          )}
          <button
            className="icon-button"
            aria-label="Close preview"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        {kind === "image" ? (
          <img
            className="still-image"
            src={clip.url}
            alt={clip.label}
            onLoad={(e) =>
              onMeasure?.(
                e.currentTarget.naturalWidth,
                e.currentTarget.naturalHeight,
              )
            }
          />
        ) : kind === "audio" ? (
          <AudioTake url={clip.url} label={clip.label} />
        ) : (
          <video
            ref={video}
            src={clip.url}
            controls
            muted
            playsInline
            aria-label={clip.label}
            onLoadedMetadata={(e) =>
              onMeasure?.(
                e.currentTarget.videoWidth,
                e.currentTarget.videoHeight,
              )
            }
          />
        )}
        <section
          className="lightbox-prompt"
          aria-label={clip.heading ?? "Saved prompt"}
        >
          <div className="lightbox-prompt-heading">
            <span>{clip.heading ?? "Prompt"}</span>
            {clip.prompt && (
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(clip.prompt!);
                    setCopyStatus("Copied");
                  } catch {
                    setCopyStatus("Select the text to copy it.");
                  }
                }}
              >
                <Icon name="copy" size={14} /> Copy prompt
              </button>
            )}
            <a
              className="download-clip"
              href={clip.url}
              download={
                clip.filename ??
                (kind === "image"
                  ? `genobi-study.${imageExtension(clip.contentType)}`
                  : "genobi-study.mp4")
              }
            >
              {kind === "image"
                ? "Download image ↓"
                : kind === "audio"
                  ? "Download audio ↓"
                  : "Download MP4 ↓"}
            </a>
          </div>
          <p className="lightbox-prompt-text">
            {clip.prompt === undefined
              ? (clip.about ?? "No saved prompt is available for this clip.")
              : clip.prompt || "No prompt — neutral upscale."}
          </p>
          {copyStatus && (
            <span className="copy-status" role="status">
              {copyStatus}
            </span>
          )}
        </section>
      </div>
    </dialog>
  );
}
