import { useLayoutEffect, useRef, type RefObject } from "react";
import { panels } from "./presets";
import { panelColumns, resizePanel, type NinjaPanel } from "./ninja-layout";

/** Fine rows let short panels occupy space underneath taller neighbours. */
export function useNinjaGrid(
  root: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  layout: string,
) {
  useLayoutEffect(() => {
    const grid = root.current;
    if (!grid || !enabled) return;
    const elements = [
      ...grid.querySelectorAll<HTMLElement>("[data-panel]:not([hidden])"),
    ];
    const measure = () =>
      elements.forEach((element) => {
        // offsetHeight ignores the reorder animation's transform.
        const span = Math.ceil((element.offsetHeight + 8) / 16);
        element.style.setProperty("--ninja-rows", String(Math.max(1, span)));
      });
    const observer = new ResizeObserver(measure);
    elements.forEach((element) => observer.observe(element));
    measure();
    return () => observer.disconnect();
  }, [root, enabled, layout]);
}

export function NinjaResize({
  panel,
  onChange,
}: {
  panel: NinjaPanel;
  onChange: (panel: NinjaPanel) => void;
}) {
  const gesture = useRef<{
    pointer: number;
    x: number;
    y: number;
    width: number;
    height: number;
    unit: number;
    original: NinjaPanel;
  } | null>(null);
  const title = panels[panel.id].title;
  return (
    <button
      className="genobi-resize-handle"
      aria-label={`Resize ${title}`}
      title="Drag to resize. Arrow keys adjust size; Shift for larger steps. Escape cancels."
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const element =
          event.currentTarget.closest<HTMLElement>("[data-panel]")!;
        const grid = element.parentElement!;
        gesture.current = {
          pointer: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          width: element.offsetWidth,
          height: element.offsetHeight,
          unit: (grid.clientWidth + 8) / 12,
          original: panel,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus({ preventScroll: true });
      }}
      onPointerMove={(event) => {
        const start = gesture.current;
        if (!start || start.pointer !== event.pointerId) return;
        onChange({
          ...panel,
          ...resizePanel(
            (start.width + event.clientX - start.x + 8) / start.unit,
            start.height + event.clientY - start.y,
          ),
        });
      }}
      onPointerUp={() => {
        gesture.current = null;
      }}
      onLostPointerCapture={() => {
        gesture.current = null;
      }}
      onPointerCancel={() => {
        if (gesture.current) onChange(gesture.current.original);
        gesture.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && gesture.current) {
          onChange(gesture.current.original);
          gesture.current = null;
          return;
        }
        if (
          !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
            event.key,
          )
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const height =
          event.currentTarget.closest<HTMLElement>(
            "[data-panel]",
          )!.offsetHeight;
        const step = event.shiftKey ? 4 : 1;
        onChange({
          ...panel,
          ...resizePanel(
            panelColumns(panel) +
              (event.key === "ArrowRight"
                ? step
                : event.key === "ArrowLeft"
                  ? -step
                  : 0),
            height +
              (event.key === "ArrowDown"
                ? 8 * step
                : event.key === "ArrowUp"
                  ? -8 * step
                  : 0),
          ),
        });
      }}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path
          d="M4 12 12 4M9 12l3-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
