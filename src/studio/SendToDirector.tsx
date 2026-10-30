import { useState } from "react";
import Icon from "../components/Icon";
import type { AddedAsset } from "./project-assets";
import {
  canUndoSend,
  sendToDirector,
  undoSend,
  type DirectorEdit,
} from "./send-to-director";
import { useStudio } from "./useStudio";
import "./send-to-director.css";

/**
 * One button that adds an item to the Director's assets without opening the
 * Director, then says what happened ("Added…" or "Already…") with an Undo
 * while the project is still the one the add produced.
 */
export function SendToDirector({
  send,
  act,
  label = "Send to Director",
  icon = false,
  disabled = false,
  className,
  onSent,
}: {
  /** Called with the pressed button, so a rail item can keep its tab. */
  send?: (from: HTMLElement) => Promise<AddedAsset>;
  /** Another edit that reaches the Director, such as setting its prompt. */
  act?: () => Promise<DirectorEdit>;
  label?: string;
  /** A compact icon button, as on gallery cards. */
  icon?: boolean;
  disabled?: boolean;
  /** The button's own class, to match the surface it sits on. */
  className?: string;
  onSent?: (sent: DirectorEdit) => void;
}) {
  // Read so Undo disappears as soon as anything else edits the project,
  // and waits while an edit or render is running.
  const bundle = useStudio((s) => s.director.bundle);
  const projectBusy = useStudio((s) =>
    Object.values(s.operations).some(Boolean),
  );
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<DirectorEdit>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  // Still the project this add made: Undo is offered, and works once idle.
  const undoable = !!sent?.after && bundle === sent.after;
  const text = busy ? `${label}…` : label;
  return (
    <span className="send-director" data-icon={icon || undefined}>
      <button
        type="button"
        className={className}
        aria-label={text}
        title={bundle ? text : "Open a project first"}
        disabled={disabled || busy || !bundle}
        onClick={async (event) => {
          const from = event.currentTarget;
          setBusy(true);
          setError("");
          setNotice("");
          try {
            const next = act
              ? await act()
              : await sendToDirector(() => send!(from));
            setSent(next);
            setNotice(next.message);
            onSent?.(next);
          } catch (failure) {
            setSent(undefined);
            setError(
              failure instanceof Error
                ? failure.message
                : "Could not send this to the Director.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {icon ? <Icon name={sent ? "check" : "plus"} size={14} /> : text}
      </button>
      {(notice || error) && (
        <span
          className="send-director-status"
          role={error ? "alert" : "status"}
        >
          {error || notice}
          {undoable && (
            <button
              type="button"
              className="text-button"
              disabled={projectBusy || !canUndoSend(sent)}
              title={
                projectBusy ? "Can't undo while the project is busy." : "Undo"
              }
              onClick={() => {
                if (undoSend(sent))
                  setNotice(act ? "Undone." : "Undone. Removed from assets.");
                setSent(undefined);
              }}
            >
              Undo
            </button>
          )}
          {icon && (
            <button
              type="button"
              className="text-button"
              aria-label="Dismiss"
              onClick={() => {
                setNotice("");
                setError("");
              }}
            >
              ×
            </button>
          )}
        </span>
      )}
    </span>
  );
}
