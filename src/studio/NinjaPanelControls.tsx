import { useEffect, useRef, useState, type PointerEvent } from "react";
import { panels, type PanelId } from "./presets";

/** Pointer capture supports touch and mouse without dragging canvas contents. */
export function useNinjaDrag(
  enabled: boolean,
  move: (from: PanelId, to: PanelId) => void,
) {
  const [drag, setDrag] = useState<{ from: PanelId; to?: PanelId } | null>(
    null,
  );
  const gesture = useRef<{
    id: number;
    from: PanelId;
    x: number;
    y: number;
    moved: boolean;
    to?: PanelId;
  } | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const draggingId = drag?.from;
  function clear() {
    gesture.current = null;
    pointer.current = null;
    setDrag(null);
  }
  function hit(x: number, y: number) {
    const panel = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-panel]");
    return panel && !panel.hidden
      ? (panel.dataset.panel as PanelId)
      : undefined;
  }
  useEffect(() => {
    if (!enabled || !draggingId) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    window.addEventListener("keydown", escape);
    // Continue scrolling while a held pointer rests near the viewport edge.
    let frame = 0;
    function scroll() {
      const p = pointer.current,
        g = gesture.current;
      if (p && g?.moved) {
        const delta = p.y < 70 ? -12 : p.y > innerHeight - 70 ? 12 : 0;
        if (delta) {
          window.scrollBy(0, delta);
          const to = hit(p.x, p.y);
          if (to !== g.to) {
            g.to = to;
            setDrag({ from: g.from, to });
          }
        }
      }
      frame = requestAnimationFrame(scroll);
    }
    frame = requestAnimationFrame(scroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", escape);
    };
  }, [enabled, draggingId]);
  return {
    drag: enabled ? drag : null,
    bind(id: PanelId) {
      return {
        onPointerDown(e: PointerEvent<HTMLButtonElement>) {
          if (!enabled || e.button !== 0) return;
          gesture.current = {
            id: e.pointerId,
            from: id,
            x: e.clientX,
            y: e.clientY,
            moved: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        },
        onPointerMove(e: PointerEvent<HTMLButtonElement>) {
          const g = gesture.current;
          if (!enabled || !g || g.id !== e.pointerId) return;
          if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 6)
            return;
          g.moved = true;
          pointer.current = { x: e.clientX, y: e.clientY };
          g.to = hit(e.clientX, e.clientY);
          setDrag({ from: g.from, to: g.to });
        },
        onPointerUp(e: PointerEvent<HTMLButtonElement>) {
          const g = gesture.current;
          if (enabled && g?.id === e.pointerId && g.moved && g.to)
            move(g.from, g.to);
          clear();
        },
        onPointerCancel: clear,
        onLostPointerCapture: clear,
      };
    },
  };
}

export function NinjaPanelControls({
  id,
  index,
  count,
  width,
  columns,
  height,
  fit,
  onFit,
  onView,
  onMove,
  onWidth,
  drag,
}: {
  id: PanelId;
  index: number;
  count: number;
  width: "half" | "full";
  columns: number;
  height?: number;
  fit: "contain" | "cover";
  onFit: () => void;
  onView: () => void;
  onMove: (offset: number) => void;
  onWidth: () => void;
  drag: ReturnType<typeof useNinjaDrag>;
}) {
  const title = panels[id].title;
  return (
    <div className="genobi-panel-arrange">
      <button
        className="genobi-drag-grip"
        aria-label={`Move ${title}`}
        title="Drag to move; arrow keys move one position; Escape cancels"
        {...drag.bind(id)}
        onKeyDown={(e) => {
          if (
            ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(e.key)
          ) {
            e.preventDefault();
            e.stopPropagation();
            onMove(e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <button
        aria-label={`Move ${title} earlier`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        aria-label={`Move ${title} later`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        ↓
      </button>
      <button
        className="genobi-panel-width"
        aria-label={`Full width ${title}`}
        aria-pressed={width === "full"}
        onClick={onWidth}
      >
        {columns === 12 ? "Full" : `${columns}/12`}
      </button>
      <button
        aria-label={`Fit content ${title}`}
        disabled={height === undefined}
        onClick={onFit}
      >
        Fit content
      </button>
      {(id === "stage" || id === "preview") && (
        <button
          aria-label={`Fill preview ${title}`}
          aria-pressed={fit === "cover"}
          title="Fit shows the whole frame; Fill crops to the panel"
          onClick={onView}
        >
          {fit === "cover" ? "Fill" : "Fit"}
        </button>
      )}
    </div>
  );
}
