import { useId, useRef, type PointerEvent } from "react";

export type MorphPoint = { progress: number; target: number };
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Pointer and keyboard access to two independent, bounded recipe values. */
export function MorphPad({
  value,
  actual,
  targets,
  disabled,
  change,
}: {
  value: MorphPoint;
  actual?: MorphPoint;
  targets: string[];
  disabled: boolean;
  change: (value: MorphPoint) => void;
}) {
  const dragging = useRef<number | null>(null);
  const hint = useId();
  const hasTargetAxis = targets.length > 1;
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height || disabled) return;
    change({
      progress: clamp(
        (((event.clientX - bounds.left) / bounds.width) * 300 - 78) / 208,
      ),
      target: hasTargetAxis
        ? clamp(
            (146 - ((event.clientY - bounds.top) / bounds.height) * 180) / 132,
          )
        : 0,
    });
  };
  const x = (progress: number) => 78 + clamp(progress) * 208;
  const y = (target: number) => 146 - clamp(target) * 132;
  return (
    <>
      <div
        className="wb-morph-pad"
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Morph plane: progress ${Math.round(value.progress * 100)} percent, target blend ${Math.round(value.target * 100)} percent`}
        aria-disabled={disabled}
        aria-describedby={hint}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          dragging.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          point(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current === event.pointerId) point(event);
        }}
        onPointerUp={(event) => {
          if (dragging.current !== event.pointerId) return;
          point(event);
          dragging.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          const step = event.shiftKey ? 0.1 : 0.01;
          const next = { ...value };
          if (event.key === "ArrowLeft") next.progress -= step;
          else if (event.key === "ArrowRight") next.progress += step;
          else if (event.key === "ArrowUp") next.target += step;
          else if (event.key === "ArrowDown") next.target -= step;
          else if (event.key === "Home") next.progress = 0;
          else if (event.key === "End") next.progress = 1;
          else return;
          event.preventDefault();
          change({
            progress: clamp(next.progress),
            target: hasTargetAxis ? clamp(next.target) : 0,
          });
        }}
      >
        <svg viewBox="0 0 300 180" aria-hidden="true">
          <rect
            className="wb-morph-pad-field"
            x="78"
            y="14"
            width="208"
            height="132"
            rx="4"
          />
          {[0.25, 0.5, 0.75].map((value) => (
            <line
              className="wb-morph-pad-grid"
              key={value}
              x1={x(value)}
              x2={x(value)}
              y1="14"
              y2="146"
            />
          ))}
          {targets.map((label, index) => {
            const position = index / Math.max(1, targets.length - 1);
            return (
              <g key={`${index}:${label}`}>
                <line
                  className="wb-morph-pad-grid"
                  x1="78"
                  x2="286"
                  y1={y(position)}
                  y2={y(position)}
                />
                <text x="70" y={y(position) + 3} textAnchor="end">
                  {label.length > 12 ? `${label.slice(0, 11)}…` : label}
                </text>
              </g>
            );
          })}
          <line
            className="wb-morph-pad-guide"
            x1={x(value.progress)}
            x2={x(value.progress)}
            y1="14"
            y2="146"
          />
          <line
            className="wb-morph-pad-guide"
            x1="78"
            x2="286"
            y1={y(value.target)}
            y2={y(value.target)}
          />
          <circle
            className="wb-morph-pad-baseline"
            cx={x(value.progress)}
            cy={y(value.target)}
            r="6"
          />
          {actual && (
            <circle
              className="wb-morph-pad-actual"
              cx={x(actual.progress)}
              cy={y(actual.target)}
              r="4"
            />
          )}
          <text x="78" y="162">
            0%
          </text>
          <text x="286" y="162" textAnchor="end">
            100%
          </text>
          <text x="182" y="176" textAnchor="middle">
            Progress →
          </text>
        </svg>
      </div>
      <p className="wb-hint" id={hint}>
        {hasTargetAxis
          ? "Drag or use arrow keys: left/right changes progress; up/down changes the target."
          : "Drag left/right or use arrow keys to change progress. Add another target to use the vertical axis."}{" "}
        This selects manual progress. Shift makes larger steps.
      </p>
    </>
  );
}
