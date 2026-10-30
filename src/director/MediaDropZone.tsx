import { useId, useRef, useState, type ReactNode } from "react";
import Icon from "../components/Icon";
import { PROJECT_ASSET_DRAG } from "./asset-drag";
import "./media-drop.css";

/** A visible drop target with one small, keyboard-accessible file picker. */
export function MediaDropZone({
  label,
  hint,
  accept,
  multiple = false,
  disabled = false,
  compact = false,
  preview,
  extraAction,
  onFiles,
  onAsset,
  onError,
}: {
  label: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  compact?: boolean;
  preview?: ReactNode;
  extraAction?: ReactNode;
  onFiles: (files: File[]) => Promise<void> | void;
  onAsset?: (transfer: DataTransfer) => Promise<void> | void;
  onError?: (error: unknown) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const hintId = useId();
  const blocked = disabled || busy;
  const supported = (types: readonly string[]) =>
    types.includes("Files") || types.includes(PROJECT_ASSET_DRAG);
  async function run(operation: () => Promise<void> | void) {
    if (disabled || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not add this media.",
      );
      onError?.(failure);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div
      className="media-drop"
      data-compact={compact || undefined}
      data-dragging={dragging || undefined}
      data-disabled={blocked || undefined}
      role="group"
      aria-label={label}
      aria-busy={busy}
      onClick={(event) => {
        if (
          !blocked &&
          event.target instanceof Element &&
          !event.target.closest("button,input")
        )
          input.current?.click();
      }}
      onDragEnter={(event) => {
        if (!supported(event.dataTransfer.types)) return;
        event.preventDefault();
        event.stopPropagation();
        if (!blocked) setDragging(true);
      }}
      onDragOver={(event) => {
        if (!supported(event.dataTransfer.types)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = blocked ? "none" : "copy";
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        if (blocked) return;
        // Copy protected drag data synchronously, before awaiting a file operation.
        if (event.dataTransfer.types.includes(PROJECT_ASSET_DRAG)) {
          if (onAsset) void run(() => onAsset(event.dataTransfer));
          else setError("Drop project media into a media slot or the prompt.");
        } else {
          const files = Array.from(event.dataTransfer.files);
          if (files.length)
            void run(() => onFiles(multiple ? files : files.slice(0, 1)));
        }
      }}
    >
      <div className="media-drop-content">
        <span className="media-drop-preview" aria-hidden="true">
          {preview ?? <Icon name="upload" size={24} />}
        </span>
        <span className="media-drop-message">
          <strong>
            {busy ? "Adding media…" : dragging ? "Release to add" : label}
          </strong>
          <span id={hintId}>{hint}</span>
        </span>
      </div>
      <div className="media-drop-actions">
        <button
          type="button"
          disabled={blocked}
          aria-describedby={hintId}
          aria-label={`Choose ${multiple ? "files" : "file"} · ${label}`}
          onClick={() => input.current?.click()}
        >
          Choose {multiple ? "files" : "file"}
        </button>
        {extraAction}
      </div>
      <input
        ref={input}
        hidden
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={blocked}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length) void run(() => onFiles(files));
        }}
      />
      {error && (
        <p className="media-drop-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
