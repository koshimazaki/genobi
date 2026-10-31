import { useRef } from "react";

/** A small pointer and keyboard handle; double-click restores automatic sizing. */
export default function PromptResizeHandle({
  fieldId,
  height,
  onResize,
  label = "prompt",
  min = 64,
  max = 640,
}: {
  fieldId: string;
  label?: string;
  min?: number;
  max?: number;
  height: () => number;
  onResize: (height: number | null) => void;
}) {
  const drag = useRef<{ y: number; height: number } | null>(null);
  const resize = (value: number) =>
    onResize(Math.max(min, Math.min(max, value)));
  return (
    <button
      type="button"
      className="prompt-resize-handle"
      aria-label={`Resize ${label}: drag or use Up and Down arrows; Home resets`}
      aria-controls={fieldId}
      title="Drag to resize · ↑ ↓ to adjust · double-click to reset"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        drag.current = { y: event.clientY, height: height() };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current)
          resize(drag.current.height + event.clientY - drag.current.y);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onDoubleClick={() => onResize(null)}
      onKeyDown={(event) => {
        if (
          !["ArrowUp", "ArrowDown", "Home", "End", "Enter", " "].includes(
            event.key,
          )
        )
          return;
        event.preventDefault();
        if (event.key === "Home") onResize(null);
        else if (event.key === "End") resize(max);
        else resize(height() + (event.key === "ArrowUp" ? -32 : 32));
      }}
    >
      <span aria-hidden="true" />
    </button>
  );
}
