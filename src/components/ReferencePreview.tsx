import { useEffect, useRef, useState } from "react";
import { openModal } from "./useModalDialog";
import Icon from "./Icon";

export default function ReferencePreview({
  url,
  label,
  kind = "image",
  sound = false,
  opener,
  className,
  closeLabel = "Close reference preview",
  onPlay,
  onClose,
}: {
  url: string;
  label: string;
  /** A video reference plays muted with controls, as the gallery's lightbox. */
  kind?: "image" | "video" | "audio";
  /**
   * Project media: video and audio keep their sound and wait for the person
   * to press play, so nothing starts with sound on its own.
   */
  sound?: boolean;
  /** Where focus returns on close, when it is not the focused control. */
  opener?: HTMLElement | null;
  className?: string;
  closeLabel?: string;
  /** Told when its video or audio starts, to keep one sound at a time. */
  onPlay?: (media: HTMLMediaElement) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    const close = openModal(
      dialog.current,
      () => opener ?? document.activeElement,
    );
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fail = () => setFailed(true);
  return (
    <dialog
      ref={dialog}
      className={className ? `video-lightbox ${className}` : "video-lightbox"}
      aria-label={label}
      // React bubbles close and cancel through the component tree, portals
      // included: kept here, they cannot close a dialog this one opened over.
      onCancel={(event) => {
        event.stopPropagation();
        onClose();
      }}
      onClose={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lightbox-content">
        <header>
          <span>{label}</span>
          <button
            className="icon-button"
            aria-label={closeLabel}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        {failed ? (
          <p className="lightbox-failed" role="status">
            This file could not be played here.
          </p>
        ) : kind === "video" ? (
          <video
            src={url}
            controls
            muted={!sound}
            playsInline
            autoPlay={!sound}
            loop={!sound}
            aria-label={label}
            onError={fail}
            onPlay={(e) => onPlay?.(e.currentTarget)}
          />
        ) : kind === "audio" ? (
          <audio
            src={url}
            controls
            preload="metadata"
            aria-label={label}
            onError={fail}
            onPlay={(e) => onPlay?.(e.currentTarget)}
          />
        ) : (
          <img className="still-image" src={url} alt={label} onError={fail} />
        )}
      </div>
    </dialog>
  );
}
