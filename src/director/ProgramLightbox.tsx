import { useEffect, useRef, type RefObject } from "react";
import Icon from "../components/Icon";

/**
 * Program, enlarged: a modal that mirrors the live preview canvas each frame,
 * so playback and scrubbing show through without a second renderer. The
 * aspect ratio is kept; Escape or Close returns focus to the preview.
 */
export default function ProgramLightbox({
  source,
  title,
  close,
}: {
  source: RefObject<HTMLCanvasElement | null>;
  title: string;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    mirror = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    let handle = 0;
    const draw = () => {
      const from = source.current,
        to = mirror.current;
      if (from && to && from.width && from.height) {
        if (to.width !== from.width) to.width = from.width;
        if (to.height !== from.height) to.height = from.height;
        to.getContext("2d")?.drawImage(from, 0, 0);
      }
      handle = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(handle);
  }, [source]);
  return (
    <dialog
      ref={dialog}
      className="dir-lightbox"
      aria-label={title}
      onClose={close}
      onClick={(e) => {
        if (e.target === dialog.current) dialog.current?.close();
      }}
    >
      <header>
        <strong>{title}</strong>
        <button
          type="button"
          aria-label="Close enlarged preview"
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      <canvas ref={mirror} aria-label="Enlarged preview" />
    </dialog>
  );
}
