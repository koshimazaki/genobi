import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";

type Position = { x: number; y: number };
type Size = { width: number; height: number };

type DragState = {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

type ResizeState = {
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  left: number;
  top: number;
};

/** Shape shared by dragHandleProps and resizeHandleProps — spread directly
 *  onto whatever element acts as the grab handle (header, resize grip nub). */
export interface PanelHandleProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  style: CSSProperties;
}

type DraggablePanelOptions = {
  lockSizeOnDrag?: boolean;
  margin?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** Opt-in: expose a uniform content-scale factor (contentScaleStyle) that
   *  shrinks the panel's content in lockstep as the panel is resized below
   *  its natural (unscaled) footprint, instead of letting it reflow/wrap. */
  autoScaleContent?: boolean;
  /** Floor for the auto-scale factor (default 0.8 — content never shrinks
   *  past 80% of its natural size; past that point the panel clips instead). */
  minContentScale?: number;
};

export interface DraggablePanelResult {
  nudge: (x: number, y: number) => void;
  rootRef: RefObject<HTMLDivElement | null>;
  dragStyle: CSSProperties;
  dragHandleProps: PanelHandleProps;
  resizeHandleProps: PanelHandleProps;
  /** Attach to the panel's measured content root (e.g. its <section>). */
  contentMeasureRef: RefObject<HTMLDivElement | null>;
  /** Spread onto the same element as contentMeasureRef — empty until the
   *  panel has actually been sized below the content's natural footprint. */
  contentScaleStyle: CSSProperties;
  /** Spread onto the panel root — clips the (larger, unscaled-layout)
   *  content box once it's being visually scaled down; empty at rest so the
   *  resting drop-shadow isn't clipped. */
  contentClipStyle: CSSProperties;
}

const INTERACTIVE_SELECTOR =
  'button,input,select,textarea,a,[data-no-panel-drag="true"]';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Drag-to-reposition (via dragHandleProps, e.g. a header) and an optional
 *  drag-to-resize corner grip (via resizeHandleProps) for fixed-position
 *  panels. Resize is opt-in: a panel only gets it by rendering an element
 *  with resizeHandleProps spread onto it — the hook itself doesn't require it. */
export function useDraggablePanel({
  lockSizeOnDrag = false,
  margin = 8,
  minWidth = 240,
  minHeight = 160,
  maxWidth = Number.POSITIVE_INFINITY,
  maxHeight = Number.POSITIVE_INFINITY,
  autoScaleContent = false,
  minContentScale = 0.8,
}: DraggablePanelOptions = {}): DraggablePanelResult {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const naturalContentSizeRef = useRef<Size | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [size, setSize] = useState<Size | null>(null);

  const cleanupDrag = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    dragStateRef.current = null;
    resizeStateRef.current = null;
  }, []);

  useEffect(() => cleanupDrag, [cleanupDrag]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fit = () => {
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = clamp(
          rect.left,
          margin,
          window.innerWidth - rect.width - margin,
        ),
        y = clamp(rect.top, margin, window.innerHeight - rect.height - margin);
      if (Math.abs(x - rect.left) > 1 || Math.abs(y - rect.top) > 1)
        setPosition({ x, y });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [margin]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;

      const panel = rootRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const win = panel.ownerDocument.defaultView ?? window;

      event.preventDefault();
      cleanupDrag();

      dragStateRef.current = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
      };
      setPosition({ x: rect.left, y: rect.top });
      if (lockSizeOnDrag) setSize({ width: rect.width, height: rect.height });

      const onMove = (moveEvent: PointerEvent) => {
        const state = dragStateRef.current;
        if (!state) return;

        const maxX = win.innerWidth - state.width - margin;
        const maxY = win.innerHeight - state.height - margin;
        setPosition({
          x: clamp(moveEvent.clientX - state.offsetX, margin, maxX),
          y: clamp(moveEvent.clientY - state.offsetY, margin, maxY),
        });
      };

      const onUp = () => cleanupDrag();

      win.addEventListener("pointermove", onMove);
      win.addEventListener("pointerup", onUp, { once: true });
      win.addEventListener("pointercancel", onUp, { once: true });
      cleanupRef.current = () => {
        win.removeEventListener("pointermove", onMove);
        win.removeEventListener("pointerup", onUp);
        win.removeEventListener("pointercancel", onUp);
      };
    },
    [cleanupDrag, lockSizeOnDrag, margin],
  );

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;

      const panel = rootRef.current;
      if (!panel) return;

      // Lazily snapshot the content's natural (unscaled) footprint the FIRST
      // time a resize gesture begins — not on mount (a folded panel would give
      // a stale height) and not via a live ResizeObserver (which reports the
      // already-resized-to box, inflating the baseline if grown then shrunk
      // back). Captured once and never re-measured for this hook instance.
      if (autoScaleContent && naturalContentSizeRef.current === null) {
        const measured = contentMeasureRef.current?.getBoundingClientRect();
        if (measured) {
          naturalContentSizeRef.current = {
            width: measured.width,
            height: measured.height,
          };
        }
      }

      const rect = panel.getBoundingClientRect();
      const win = panel.ownerDocument.defaultView ?? window;

      event.preventDefault();
      event.stopPropagation();
      cleanupDrag();

      // Resizing also pins position explicitly — the panel may have been using
      // right/bottom-anchored CSS, and growing in place should expand from its
      // current top-left corner rather than from those original anchors.
      setPosition({ x: rect.left, y: rect.top });
      resizeStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        left: rect.left,
        top: rect.top,
      };

      const onMove = (moveEvent: PointerEvent) => {
        const state = resizeStateRef.current;
        if (!state) return;

        const maxAvailableWidth = win.innerWidth - state.left - margin;
        const maxAvailableHeight = win.innerHeight - state.top - margin;
        setSize({
          width: clamp(
            state.startWidth + (moveEvent.clientX - state.startX),
            minWidth,
            Math.min(maxWidth, maxAvailableWidth),
          ),
          height: clamp(
            state.startHeight + (moveEvent.clientY - state.startY),
            minHeight,
            Math.min(maxHeight, maxAvailableHeight),
          ),
        });
      };

      const onUp = () => cleanupDrag();

      win.addEventListener("pointermove", onMove);
      win.addEventListener("pointerup", onUp, { once: true });
      win.addEventListener("pointercancel", onUp, { once: true });
      cleanupRef.current = () => {
        win.removeEventListener("pointermove", onMove);
        win.removeEventListener("pointerup", onUp);
        win.removeEventListener("pointercancel", onUp);
      };
    },
    [
      autoScaleContent,
      cleanupDrag,
      margin,
      minWidth,
      minHeight,
      maxWidth,
      maxHeight,
    ],
  );

  // factor = clamp(min(size/natural, 1), minContentScale, 1) — one uniform
  // factor for both axes so text/icons never distort independently. Stays at
  // 1 (no-op) until a resize has both captured a natural baseline AND sized
  // the panel below it.
  const natural = naturalContentSizeRef.current;
  const scaleFactor =
    autoScaleContent && natural && size
      ? clamp(
          Math.min(size.width / natural.width, size.height / natural.height, 1),
          minContentScale,
          1,
        )
      : 1;

  const contentScaleStyle: CSSProperties =
    natural && scaleFactor < 1
      ? {
          // Pin the content to its natural box so shrinking the panel scales it
          // visually instead of reflowing it, then transform-scale that fixed
          // box down to fit. flex: 'none' stops the flex layout from also
          // shrinking the (now larger-than-container) box on its own.
          width: natural.width,
          height: natural.height,
          flex: "none",
          transform: `scale(${scaleFactor})`,
          transformOrigin: "top left",
        }
      : {};

  // The pinned natural-size content box is now larger than the shrunk panel
  // root — clip it there (only once scaling is actually in effect) so it
  // doesn't visually spill past the panel's edges.
  const contentClipStyle: CSSProperties =
    scaleFactor < 1 ? { overflow: "hidden" } : {};

  return {
    nudge: (x, y) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect)
        setPosition({
          x: clamp(
            rect.left + x,
            margin,
            window.innerWidth - rect.width - margin,
          ),
          y: clamp(
            rect.top + y,
            margin,
            window.innerHeight - rect.height - margin,
          ),
        });
    },
    rootRef,
    contentMeasureRef,
    dragStyle: position
      ? {
          left: position.x,
          top: position.y,
          right: "auto",
          bottom: "auto",
          transform: "none",
          ...(size ? { width: size.width, height: size.height } : null),
        }
      : {},
    dragHandleProps: {
      onPointerDown,
      style: {
        cursor: "grab",
        touchAction: "none",
        userSelect: "none",
      },
    },
    resizeHandleProps: {
      onPointerDown: onResizePointerDown,
      style: {
        cursor: "nwse-resize",
        touchAction: "none",
        userSelect: "none",
      },
    },
    contentScaleStyle,
    contentClipStyle,
  };
}
