import { imageExtension } from "../image-download";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import ModelTag from "./ModelTag";
export interface ViewingClip {
  url: string;
  mediaType?: "image" | "video";
  contentType?: string;
  label: string;
  prompt?: string;
  /** A catalogue clip's provenance line, shown when it has no saved prompt. */
  about?: string;
  /** Which model made the clip, as the gallery card tags it. */
  signature?: { tag: string; title: string };
}
export default function VideoLightbox({
  clip,
  onClose,
}: {
  clip: ViewingClip | null;
  onClose: () => void;
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
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    void video.current?.play().catch(() => {});
    return () => {
      video.current?.pause();
      dialog.current?.close();
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [clip]);
  if (!clip) return null;
  return (
    <dialog
      ref={dialog}
      className="video-lightbox"
      aria-label={clip.label}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lightbox-content">
        <header>
          <span>
            {clip.mediaType === "image" ? "Image preview" : "Video preview"}
            {clip.signature && <ModelTag {...clip.signature} />}
          </span>
          <button
            className="icon-button"
            aria-label="Close preview"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        {clip.mediaType === "image" ? (
          <img className="still-image" src={clip.url} alt={clip.label} />
        ) : (
          <video
            ref={video}
            src={clip.url}
            controls
            muted
            playsInline
            aria-label={clip.label}
          />
        )}
        <section className="lightbox-prompt" aria-label="Saved prompt">
          <div className="lightbox-prompt-heading">
            <span>Prompt</span>
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
                clip.mediaType === "image"
                  ? `genobi-study.${imageExtension(clip.contentType)}`
                  : "genobi-study.mp4"
              }
            >
              {clip.mediaType === "image"
                ? "Download image ↓"
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
