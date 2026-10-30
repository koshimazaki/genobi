import { useRef } from "react";
import "./resize-handle.css";

/**
 * A pointer and keyboard divider: drag it, or focus it and use the arrow keys
 * (Shift for larger steps). Escape during a drag restores the value it began
 * with. `vertical` resizes a height; `reverse` grows as it moves left or up.
 */
export default function ResizeHandle({
  label,
  value,
  min,
  max,
  change,
  vertical = false,
  reverse = false,
  className = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  change: (v: number) => void;
  vertical?: boolean;
  reverse?: boolean;
  className?: string;
}) {
  const drag = useRef<{ at: number; value: number; id: number } | null>(null);
  const update = (v: number) => change(Math.max(min, Math.min(max, v)));
  const sign = reverse ? -1 : 1;
  return (
    <div
      className={`resize-handle ${vertical ? "resize-height" : "resize-width"} ${className}`}
      role="separator"
      aria-label={label}
      aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label}: drag, or use the arrow keys`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        drag.current = {
          at: vertical ? e.clientY : e.clientX,
          value,
          id: e.pointerId,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d?.id === e.pointerId)
          update(d.value + ((vertical ? e.clientY : e.clientX) - d.at) * sign);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        if (drag.current) update(drag.current.value);
        drag.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && drag.current) {
          update(drag.current.value);
          drag.current = null;
        }
        const keys = vertical
          ? ["ArrowUp", "ArrowDown"]
          : ["ArrowLeft", "ArrowRight"];
        if (!keys.includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 64 : 16;
        update(value + (e.key === keys[0] ? -step : step) * sign);
      }}
    >
      <i />
    </div>
  );
}
