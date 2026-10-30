import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { REGENERATE_INSTRUCTION_MAX } from "../../shared/director/regenerate";
import { NO_COPY } from "./regenerate";
import { useAgentSend } from "./useAgentSend";
import "./regenerate.css";

export { outcomeNote } from "./useAgentSend";

/**
 * The field's own attributes. `role="dialog"` keeps the timeline's keys
 * (Space, Backspace, C, S) off its buttons: it sits outside every panel, so
 * without it the Director would take them as its own (`timeline-keys.ts`).
 */
export const POPOVER_PROPS = {
  role: "dialog",
  className: "dir-regenerate-pop",
  "aria-label": "Regenerate with the agent",
} as const;

/** Under the button, right-aligned to it, never past a 16 px window edge. */
export function popoverPlace(
  rect: Pick<DOMRect, "right" | "bottom">,
  width: number,
  height: number,
): CSSProperties {
  const w = Math.min(360, width - 32);
  const top = rect.bottom + 6;
  return {
    position: "fixed",
    top,
    left: Math.max(16, Math.min(rect.right - w, width - w - 16)),
    width: w,
    maxHeight: Math.max(160, height - top - 16),
  };
}

/**
 * Regenerate, beside Render MP4: a compact field ("What should change?")
 * whose Send hands the instruction and the project's edits to the agent
 * (`regenerate.ts`). It floats over the page, fixed under the button and
 * kept inside the window, so no panel clips it and the toolbar never moves.
 */
export default function RegenerateAction({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [place, setPlace] = useState<CSSProperties>();
  const field = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const { send: sendNow, sending, note, copy, working, label } = useAgentSend();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect) setPlace(popoverPlace(rect, innerWidth, innerHeight));
    };
    update();
    addEventListener("resize", update);
    addEventListener("scroll", update, true);
    return () => {
      removeEventListener("resize", update);
      removeEventListener("scroll", update, true);
    };
  }, [open]);
  // Once per opening: a scroll or resize moves the field, not the focus.
  const focused = useRef(false);
  useEffect(() => {
    if (!open) focused.current = false;
    else if (place && !focused.current) {
      focused.current = true;
      field.current?.focus();
    }
  }, [open, place]);

  // The words stay in the field until they went to the agent.
  async function send() {
    if (await sendNow(text)) setText("");
  }

  return (
    <div className="dir-regenerate">
      <button
        ref={trigger}
        className={`dir-primary dir-agent-action${working ? " is-generating" : ""}`}
        aria-busy={working}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled && !open}
        title={
          copy === false
            ? NO_COPY
            : working
              ? "The agent is still working on this project; its progress is in the bubble"
              : "Hand your edits and an instruction to the agent so it works again"
        }
        onClick={() => setOpen(!open)}
      >
        Regenerate
      </button>
      {open &&
        place &&
        createPortal(
          <form
            {...POPOVER_PROPS}
            id={id}
            style={place}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                close();
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label htmlFor={`${id}-text`}>What should change?</label>
            <textarea
              id={`${id}-text`}
              ref={field}
              rows={3}
              maxLength={REGENERATE_INSTRUCTION_MAX}
              placeholder="Fix the second shot, use my new order, keep the trims."
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <p className="dir-regenerate-hint">
              The agent gets this with the project&rsquo;s order, trims and
              frame notes. Paid steps wait for your approval.
            </p>
            {label.hint && copy !== false && (
              <p className="dir-regenerate-hint">{label.hint}</p>
            )}
            <div className="dir-regenerate-actions">
              <button type="button" onClick={close}>
                Close
              </button>
              <button
                type="submit"
                className="dir-primary"
                disabled={sending || !text.trim() || copy === false}
                title={
                  label.runner
                    ? `Genobi works through ${label.runner}, the agent set up here`
                    : undefined
                }
              >
                {sending ? "Sending…" : label.button}
              </button>
            </div>
            {copy === false && !note && (
              <p className="dir-regenerate-note" role="status">
                {NO_COPY}
              </p>
            )}
            {note && (
              <p
                className="dir-regenerate-note"
                role={note.alert ? "alert" : "status"}
              >
                {note.text}
              </p>
            )}
          </form>,
          document.body,
        )}
    </div>
  );
}
