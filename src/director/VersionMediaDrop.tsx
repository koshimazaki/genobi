import { useRef, useState, type ReactNode } from "react";
import { TEMPLATE_ACCEPT } from "../../shared/templates/intake";
import type { VersionSlot } from "../../shared/templates/version";
import { acceptsStudioMedia, studioDropFiles } from "../studio/media-drop";
import { useShell } from "../studio/ShellContext";
import type { Bundle } from "./bundle";

/** Disk and studio-asset drops use the same validated import as the file chooser. */
export default function VersionMediaDrop({
  slot,
  bundle,
  disabled,
  upload,
  children,
}: {
  slot: VersionSlot;
  bundle: Bundle;
  disabled: boolean;
  upload: (files: File[]) => Promise<void>;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const library = useShell()?.library;
  const busy = disabled || reading;
  async function accept(files: Promise<File[]> | File[]) {
    if (disabled || lock.current) return;
    lock.current = true;
    setReading(true);
    setError("");
    try {
      const selected = await files;
      if (selected.length) await upload(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read these files.");
    } finally {
      lock.current = false;
      setReading(false);
    }
  }
  return (
    <div className="dir-version-drop-wrap">
      <div
        className="dir-version-drop"
        data-dragging={over || undefined}
        aria-busy={reading}
        onDragOver={(e) => {
          if (!busy && acceptsStudioMedia([...e.dataTransfer.types])) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          if (!busy && acceptsStudioMedia([...e.dataTransfer.types]))
            void accept(studioDropFiles(e.dataTransfer, bundle, library));
        }}
      >
        {children}
        <button
          type="button"
          className="dir-version-drop__choose"
          disabled={busy}
          onClick={() => input.current?.click()}
          aria-label={`Choose ${slot.kind} for ${slot.label}`}
        >
          <strong>
            {reading ? "Reading files…" : `Drop ${slot.kind} here`}
          </strong>
          <span>
            or choose {slot.max > 1 ? `up to ${slot.max} files` : "a file"}
          </span>
        </button>
        <input
          ref={input}
          className="sr-only"
          type="file"
          hidden
          aria-label={`Upload ${slot.label}`}
          accept={
            slot.kind === "video"
              ? "video/mp4,.mp4"
              : TEMPLATE_ACCEPT[slot.kind]
          }
          multiple={slot.max > 1}
          disabled={busy}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void accept(files);
          }}
        />
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
