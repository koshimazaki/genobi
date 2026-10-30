import { useEffect, useRef } from "react";

export type TimelineCommand = "play" | "delete" | "split";
/** Decides whether a timeline owns a panel; `undefined` is a standalone page. */
export type PanelOwner = (panel: string | undefined) => boolean;

// Buttons, sliders and toggles do not take typed text, so timeline keys still
// work while one has focus; text entry and dialogs keep every key.
const TEXT_ENTRY =
  'textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="listbox"], input:not([type="range"], [type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="color"], [type="file"])';

// A modal such as the key dialog owns its keys; only a dialog that hosts the
// timeline itself (`data-timeline-host`) passes them through.
const OTHER_DIALOG = "dialog:not([data-timeline-host])";

const panelOf = (element: Element | null) =>
  element?.closest<HTMLElement>("[data-panel]")?.dataset.panel;

/** Space plays, Delete/Backspace removes the selected clip, C or S splits. */
export function timelineCommand(
  event: KeyboardEvent,
  owns: PanelOwner,
  lastPointer: Element | null = null,
): TimelineCommand | undefined {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(TEXT_ENTRY) || target?.closest(OTHER_DIALOG)) return;
  // With nothing focused, the panel last clicked decides.
  const focused = target && !["BODY", "HTML"].includes(target.tagName);
  if (!owns(panelOf(focused ? target : lastPointer))) return;
  if (event.code === "Space" || event.key === " ") return "play";
  if (event.key === "Delete" || event.key === "Backspace") return "delete";
  if (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "s")
    return "split";
}

/**
 * Window-level so keys work after clicking Play or a clip, scoped by panel so
 * the Director and Dual Swords never both answer one key in Ninja.
 * `run` returns true when it handled the command.
 */
export function useTimelineKeys(
  enabled: boolean,
  owns: PanelOwner,
  run: (command: TimelineCommand) => boolean,
) {
  const latest = useRef({ owns, run });
  latest.current = { owns, run };
  useEffect(() => {
    if (!enabled) return;
    let lastPointer: Element | null = null;
    let swallowKeyUp = false;
    const pointer = (e: PointerEvent) => {
      lastPointer = e.target instanceof Element ? e.target : null;
    };
    const down = (e: KeyboardEvent) => {
      const command = timelineCommand(e, latest.current.owns, lastPointer);
      if (command && latest.current.run(command)) {
        e.preventDefault();
        swallowKeyUp = e.code === "Space";
      }
    };
    // A focused button activates on Space keyup; the play toggle replaces it.
    const up = (e: KeyboardEvent) => {
      if (swallowKeyUp && e.code === "Space") e.preventDefault();
      swallowKeyUp = false;
    };
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [enabled]);
}
