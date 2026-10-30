import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  clampFrame,
  defaultFrame,
  isCompact,
  keyStep,
  moveFrame,
  resizeFrame,
  type Frame,
} from "./window-frame";

const viewport = () => ({ width: innerWidth, height: innerHeight });

/**
 * A movable, resizable window. Pointer events cover mouse, pen and touch;
 * the arrow keys move or resize from a focused handle (Shift for larger
 * steps). At phone widths the window fills the screen and the handles do
 * nothing, since there is no room to move it.
 */
export function useWindowFrame() {
  const [frame, setFrame] = useState<Frame>(() => defaultFrame(viewport()));
  const [compact, setCompact] = useState(() => isCompact(viewport()));
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    start: Frame;
  } | null>(null);
  useEffect(() => {
    const resize = () => {
      const next = viewport();
      setCompact(isCompact(next));
      setFrame((current) => clampFrame(current, next));
    };
    addEventListener("resize", resize);
    return () => removeEventListener("resize", resize);
  }, []);
  const change = (
    kind: "move" | "resize",
    from: Frame,
    dx: number,
    dy: number,
  ) =>
    kind === "move"
      ? moveFrame(from, dx, dy, viewport())
      : resizeFrame(from, dx, dy, viewport());
  function handle(kind: "move" | "resize") {
    return {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (compact || event.button !== 0) return;
        // The header's own buttons keep their clicks.
        const control = (event.target as Element).closest("button, a, input");
        if (control && control !== event.currentTarget) return;
        event.preventDefault();
        // The move handle sits in the title bar: one drag, handled once.
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = {
          pointer: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          start: frame,
        };
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const active = drag.current;
        if (!active || active.pointer !== event.pointerId) return;
        event.stopPropagation();
        setFrame(
          change(
            kind,
            active.start,
            event.clientX - active.x,
            event.clientY - active.y,
          ),
        );
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        if (drag.current?.pointer !== event.pointerId) return;
        event.stopPropagation();
        drag.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      },
      onPointerCancel() {
        drag.current = null;
      },
      onKeyDown(event: KeyboardEvent<HTMLElement>) {
        const step = keyStep(event.key, event.shiftKey);
        if (!step || compact || event.currentTarget !== event.target) return;
        event.preventDefault();
        setFrame((current) => change(kind, current, step[0], step[1]));
      },
    };
  }
  return {
    frame,
    compact,
    handle,
    reset: () => setFrame(defaultFrame(viewport())),
  };
}
