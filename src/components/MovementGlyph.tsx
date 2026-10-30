// Adapted from the owner-supplied dsgndept MovementGlyph, via the timeline
// design; see LICENCES.md.
import type { JSX } from "react";

/** Presentation attributes shared by every stroke of a glyph. */
interface Stroke {
  fill: string;
  stroke: string;
  strokeWidth?: number;
  strokeLinecap?: "round";
  strokeLinejoin?: "round";
}

/**
 * MovementGlyph — renders a camera/action movement as a small instrument glyph.
 * Used both on the timeline lanes and inside the click-to-pick movement menu.
 * `variant` keys the drawing; `color` tints it (intel for camera, rust for action).
 */
export function MovementGlyph({
  variant = "linear",
  color = "var(--intel)",
  size,
}: {
  variant?: string;
  color?: string;
  size?: number;
}) {
  const c: Stroke = {
    fill: "none",
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  const f: Stroke = { fill: color, stroke: "none" };
  const ah = (x: number, y: number, d: number) => (
    <path d={`M${x} ${y} l${-6 * d} -3.4 M${x} ${y} l${-6 * d} 3.4`} {...c} />
  ); // → head
  const av = (x: number, y: number, d: number) => (
    <path d={`M${x} ${y} l-3.4 ${6 * d} M${x} ${y} l3.4 ${6 * d}`} {...c} />
  ); // ↑ head (d=1 up)

  const G: Record<string, JSX.Element> = {
    linear: (
      <>
        <line x1="7" y1="14" x2="40" y2="14" {...c} />
        {ah(41, 14, 1)}
      </>
    ),
    forward: (
      <>
        <line x1="7" y1="14" x2="40" y2="14" {...c} />
        {ah(41, 14, 1)}
      </>
    ),
    zigzag: (
      <>
        <path d="M6 16 L13 8 L20 16 L27 8 L34 16 L40 12" {...c} />
        {ah(41, 12, 1)}
      </>
    ),
    accel: (
      <>
        <line x1="7" y1="14" x2="40" y2="14" {...c} strokeDasharray="2 3" />
        {ah(41, 14, 1)}
      </>
    ),
    decel: (
      <>
        <line x1="7" y1="14" x2="38" y2="14" {...c} />
        {ah(38, 14, 1)}
        <line x1="42" y1="8" x2="42" y2="20" {...c} />
      </>
    ),
    truck_r: (
      <>
        <line x1="7" y1="14" x2="40" y2="14" {...c} />
        {ah(41, 14, 1)}
      </>
    ),
    truck_l: (
      <>
        <line x1="41" y1="14" x2="8" y2="14" {...c} />
        {ah(7, 14, -1)}
      </>
    ),
    tilt_u: (
      <>
        <line x1="24" y1="23" x2="24" y2="7" {...c} />
        {av(24, 6, 1)}
      </>
    ),
    rise: (
      <>
        <line x1="24" y1="23" x2="24" y2="7" {...c} />
        {av(24, 6, 1)}
      </>
    ),
    crane_up: (
      <>
        <path d="M14 22 Q20 8 34 8" {...c} />
        {ah(34, 8, 1)}
      </>
    ),
    tilt_d: (
      <>
        <line x1="24" y1="5" x2="24" y2="21" {...c} />
        {av(24, 22, -1)}
      </>
    ),
    drop: (
      <>
        <line x1="24" y1="5" x2="24" y2="21" {...c} />
        {av(24, 22, -1)}
      </>
    ),
    crane_dn: (
      <>
        <path d="M14 8 Q20 22 34 22" {...c} />
        {ah(34, 22, 1)}
      </>
    ),
    pan_l: (
      <>
        <path d="M41 14 Q24 8 9 14" {...c} />
        {ah(8, 14, -1)}
      </>
    ),
    pan_r: (
      <>
        <path d="M7 14 Q24 8 39 14" {...c} />
        {ah(40, 14, 1)}
      </>
    ),
    push_in: (
      <>
        <path d="M6 8 l8 6 -8 6" {...c} />
        <path d="M42 8 l-8 6 8 6" {...c} />
        <line x1="20" y1="14" x2="28" y2="14" {...c} />
      </>
    ),
    pull_out: (
      <>
        <path d="M14 8 l-8 6 8 6" {...c} />
        <path d="M34 8 l8 6 -8 6" {...c} />
      </>
    ),
    orbit: (
      <>
        <ellipse cx="24" cy="14" rx="14" ry="7" {...c} />
        <path d="M34 9 l4 -1 -1 4" {...c} />
      </>
    ),
    orbit_ccw: (
      <>
        <ellipse cx="24" cy="14" rx="14" ry="7" {...c} />
        <path d="M14 9 l-4 -1 1 4" {...c} />
      </>
    ),
    arc: (
      <>
        <path d="M7 20 Q24 2 41 16" {...c} />
        <g transform="rotate(39.47 41 16)">{ah(41, 16, 1)}</g>
      </>
    ),
    whip: (
      <>
        <line x1="8" y1="10" x2="40" y2="10" {...c} />
        {ah(41, 10, 1)}
        <line x1="8" y1="18" x2="34" y2="18" {...c} strokeDasharray="2 2" />
        {ah(35, 18, 1)}
      </>
    ),
    handheld: (
      <>
        <path d="M7 14 q4 -6 8 0 t8 0 t8 0 t8 0" {...c} />
      </>
    ),
    static: (
      <>
        <circle cx="24" cy="14" r="2.4" {...f} />
        <path
          d="M14 8 v-2 h4 M30 8 v-2 h-4 M14 20 v2 h4 M30 20 v2 h-4"
          {...c}
        />
      </>
    ),
    impact: (
      <>
        <circle cx="24" cy="14" r="3" {...f} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const r = (a * Math.PI) / 180;
          return (
            <line
              key={a}
              x1={24 + 5 * Math.cos(r)}
              y1={14 + 5 * Math.sin(r)}
              x2={24 + 10 * Math.cos(r)}
              y2={14 + 10 * Math.sin(r)}
              {...c}
            />
          );
        })}
      </>
    ),
    infinity: (
      <path
        d="M24 14 C24 8 15 8 15 14 C15 20 24 20 24 14 C24 8 33 8 33 14 C33 20 24 20 24 14Z"
        {...c}
      />
    ),
    release: (
      <>
        <line x1="7" y1="14" x2="36" y2="14" {...c} />
        <circle cx="40" cy="14" r="3" {...c} />
      </>
    ),
    hold: (
      <>
        <line x1="20" y1="7" x2="20" y2="21" {...c} strokeWidth="2.4" />
        <line x1="28" y1="7" x2="28" y2="21" {...c} strokeWidth="2.4" />
      </>
    ),
    converge: (
      <>
        <path d="M7 14 h10" {...c} />
        {ah(18, 14, 1)}
        <path d="M41 14 h-10" {...c} />
        {ah(30, 14, -1)}
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 28"
      width={size || "100%"}
      height={size ? size * 0.58 : "100%"}
      preserveAspectRatio="xMidYMid meet"
      style={{ maxHeight: 26 }}
    >
      {G[variant] || G.linear}
    </svg>
  );
}
