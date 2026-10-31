/**
 * Small instrument parts for the Capture panel, ported from Holodeck's dsgn
 * primitives (Badge, AspectGlyph, SegmentedBank; MIT, see
 * Holodeck-LICENSE.txt). The geometry and roles are Holodeck's; the styling
 * is camera-director's tokens in capture-panel.css.
 */
import { useRef, type ReactNode } from "react";
import type { CaptureTone } from "./capture-panel";

/** A compact status marker; a dot pulses while something runs. */
export function Badge({
  children,
  tone,
  dot = false,
  pulse = false,
}: {
  children: ReactNode;
  tone?: CaptureTone;
  dot?: boolean;
  pulse?: boolean;
}) {
  return (
    <span
      className="wb-badge"
      data-tone={tone}
      data-dot={dot || undefined}
      data-pulse={pulse || undefined}
    >
      {children}
    </span>
  );
}

/** The four-corner bracket glyph that previews an aspect ratio, scaled to rw:rh. */
export function AspectGlyph({
  rw,
  rh,
  vw = 24,
  vh = 16,
}: {
  rw: number;
  rh: number;
  vw?: number;
  vh?: number;
}) {
  const sc = Math.min((vw * 0.67) / rw, (vh * 0.69) / rh);
  const w = rw * sc,
    h = rh * sc;
  const x0 = (vw - w) / 2,
    y0 = (vh - h) / 2,
    x1 = x0 + w,
    y1 = y0 + h;
  const b = Math.max(2.4, Math.min(w, h) * 0.34);
  const segs = [
    `M${x0 + b} ${y0}V${y0 + b}H${x0}`,
    `M${x1 - b} ${y0}V${y0 + b}H${x1}`,
    `M${x1} ${y1 - b}H${x1 - b}V${y1}`,
    `M${x0} ${y1 - b}H${x0 + b}V${y1}`,
  ];
  return (
    <svg
      width={vw}
      height={vh}
      viewBox={`0 0 ${vw} ${vh}`}
      fill="none"
      aria-hidden="true"
    >
      {segs.map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export type BankOption = { value: string; label: ReactNode; title?: string };

/** A recessed row of mutually exclusive choices (a radio group of buttons). */
export function SegmentedBank({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: readonly BankOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div className="wb-bank" role="radiogroup" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={index === selected ? 0 : -1}
          title={option.title}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowRight" || event.key === "ArrowDown"
                ? (index + 1) % options.length
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? (index + options.length - 1) % options.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? options.length - 1
                      : null;
            if (!disabled && next !== null) {
              event.preventDefault();
              onChange(options[next].value);
              buttons.current[next]?.focus();
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A labelled status line with a coloured dot, as Holodeck's sync readouts. */
export function StatusDot({
  on,
  children,
}: {
  on: boolean;
  children: ReactNode;
}) {
  return (
    <li className="wb-status-dot" data-on={on}>
      {children}
    </li>
  );
}
