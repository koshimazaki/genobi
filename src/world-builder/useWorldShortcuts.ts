import { togglePlay } from "./example-track";
import { useEffect, type RefObject } from "react";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import { isTypingTarget } from "../keyboard";

/**
 * World Builder's keys act on World Builder: an event counts when it comes
 * from inside its root, or from nowhere in particular (the page body). A
 * focused control elsewhere, such as the 3D camera panel's buttons or the
 * voice overlay, keeps Space and Delete for itself.
 */
export function withinSurface(
  target: EventTarget | null,
  root: Pick<Node, "contains"> | null,
  doc:
    | Pick<Document, "body" | "documentElement">
    | undefined = globalThis.document,
): boolean {
  if (!root) return false;
  const page: unknown[] = [doc, doc?.body, doc?.documentElement];
  if (!target || page.includes(target)) return true;
  return root.contains(target as Node);
}

export function useWorldShortcuts(
  s: BuilderSession,
  e: WorldEditor,
  active = true,
  root?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTypingTarget(event.target) ||
        (event.target instanceof Element &&
          event.target.closest('button, a, summary, [role="button"]')) ||
        (root && !withinSurface(event.target, root.current)) ||
        !s.ready ||
        s.busy
      )
        return;
      if (event.code === "Space" && e.mode === "shot") {
        event.preventDefault();
        togglePlay(s);
      }
      if (
        (event.code === "Delete" || event.code === "Backspace") &&
        e.mode === "edit" &&
        e.prop
      ) {
        event.preventDefault();
        e.remove();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [s, e, active, root]);
}
