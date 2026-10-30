/**
 * The camera motion radar, redrawn from Holodeck's
 * `components/ui/camera-motion-drawing.ts` (MIT, Glitch Candies Studio; the
 * World Builder carries an unthemed copy). Same two views (top path and side
 * altitude), grid, swept arc, markers and labels; here it plots the plate's
 * whole sampled path rather than a straight start-to-end guess, fits its
 * range to the path, and takes its colours from the studio theme.
 */
import type { Vec3 } from "./scenes";

export interface RadarPalette {
  /** Centre and edge of the pane's radial wash. */
  wash: [string, string];
  path: string;
  end: string;
  subject: string;
  start: string;
  grid: string;
  label: string;
  layers: string[];
}

export interface RadarLayer {
  end: Vec3;
  weight: number;
}

export interface RadarInput {
  /** Camera positions relative to the subject, start to end. */
  trace: Vec3[];
  /** 0..1 along the trace. */
  t: number;
  layers: RadarLayer[];
}

/**
 * Below this many CSS pixels a pane draws only its wash: there is no room
 * for the grid, markers and labels, and the radii would go negative.
 */
export const RADAR_MIN_SIZE = 48;

export type RadarView = "top" | "side";

/** Theme colours from the element's computed custom properties. */
export function readPalette(element: Element): RadarPalette {
  const css = getComputedStyle(element);
  const v = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;
  return {
    wash: [v("--surface", "#1e2227"), v("--bg", "#101316")],
    path: v("--intel", "#6faab6"),
    end: v("--camera-shot", "#cfb897"),
    subject: v("--accent", "#a8be5c"),
    start: v("--muted", "#8b929c"),
    grid: v("--border", "#333a42"),
    label: v("--soft", "#a4abb4"),
    layers: [
      v("--intel", "#6faab6"),
      v("--camera-shot", "#cfb897"),
      v("--acoustic", "#8dbce8"),
      v("--accent", "#a8be5c"),
    ],
  };
}

/**
 * The pane's 2D context, asked for once with `willReadFrequently` so it is
 * rasterised on the CPU from the first draw. Chrome can otherwise move a
 * canvas from GPU to CPU after a pixel readback, and a later redraw of the
 * same input would then differ by a level here and there.
 */
const context = (canvas: HTMLCanvasElement) =>
  canvas.getContext("2d", { willReadFrequently: true });

/** Match the backing store to the CSS box at the device pixel ratio. */
export function sizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr =
    (canvas.ownerDocument.defaultView ?? window).devicePixelRatio || 1;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.round(width * dpr))
    canvas.width = Math.round(width * dpr);
  if (canvas.height !== Math.round(height * dpr))
    canvas.height = Math.round(height * dpr);
  context(canvas)?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export type Point = { x: number; y: number };

/**
 * Map subject-relative positions onto a pane. One scale serves both axes and
 * is capped by the tighter of width and height, so the whole path (range
 * from `radarRange`) fits any pane: a tall crane in a wide, short pane too.
 */
export function radarProjector(
  view: RadarView,
  w: number,
  h: number,
  range: number,
) {
  if (view === "top") {
    const scale = Math.max(0, Math.min(w, h) / 2 - 14) / range;
    return (p: Vec3): Point => ({
      x: w / 2 + p[0] * scale,
      y: h / 2 + p[2] * scale,
    });
  }
  // Depth spans half the width each side; height spans the band above the
  // ground line (20 px from the bottom) up to 18 px from the top.
  const scale = Math.max(0, Math.min((w - 28) / (range * 2), (h - 38) / range));
  return (p: Vec3): Point => ({
    x: w / 2 + p[2] * scale,
    y: h - 20 - Math.max(0, p[1]) * scale,
  });
}

export interface Wedge {
  start: number;
  end: number;
  anticlockwise: boolean;
}

/**
 * The swept wedge from the start bearing to the bearing at `now`, following
 * the path: bearings are unwrapped step by step, so a sweep that crosses
 * ±180° keeps its direction and its true size (capped at a full turn).
 */
export function sweptWedge(
  points: readonly Point[],
  origin: Point,
  now: number,
): Wedge {
  const bearing = (p: Point) => Math.atan2(p.y - origin.y, p.x - origin.x);
  const start = bearing(points[0]);
  let swept = 0;
  let previous = start;
  for (let i = 1; i <= now && i < points.length; i++) {
    const next = bearing(points[i]);
    let step = next - previous;
    if (step > Math.PI) step -= 2 * Math.PI;
    if (step < -Math.PI) step += 2 * Math.PI;
    swept += step;
    previous = next;
  }
  swept = Math.max(-2 * Math.PI, Math.min(2 * Math.PI, swept));
  return { start, end: start + swept, anticlockwise: swept < 0 };
}

function marker(
  ctx: CanvasRenderingContext2D,
  p: Point,
  color: string,
  size: number,
  shape: "dot" | "diamond",
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.beginPath();
  if (shape === "diamond") {
    ctx.moveTo(p.x, p.y - size);
    ctx.lineTo(p.x + size, p.y);
    ctx.lineTo(p.x, p.y + size);
    ctx.lineTo(p.x - size, p.y);
    ctx.closePath();
  } else ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  p: Point,
  color: string,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "9px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.fillText(text, p.x, p.y);
  ctx.restore();
}

function grid(
  ctx: CanvasRenderingContext2D,
  view: RadarView,
  w: number,
  h: number,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (view === "top") {
    const r = Math.max(0, Math.min(w, h) / 2 - 14);
    for (const k of [0.34, 0.62, 0.9]) {
      ctx.moveTo(w / 2 + r * k, h / 2);
      ctx.arc(w / 2, h / 2, r * k, 0, Math.PI * 2);
    }
    ctx.moveTo(w / 2 - r, h / 2);
    ctx.lineTo(w / 2 + r, h / 2);
    ctx.moveTo(w / 2, h / 2 - r);
    ctx.lineTo(w / 2, h / 2 + r);
  } else {
    const top = 18;
    const bottom = h - 20;
    for (let i = 0; i <= 3; i++) {
      const y = top + ((bottom - top) / 3) * i;
      ctx.moveTo(12, y);
      ctx.lineTo(w - 12, y);
    }
    ctx.moveTo(w / 2, top);
    ctx.lineTo(w / 2, bottom);
  }
  ctx.stroke();
  ctx.restore();
}

function polyline(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
}

/** Fit the view to the path and the layers' end points, never closer than 8. */
export function radarRange(input: RadarInput, view: RadarView): number {
  const points = [...input.trace, ...input.layers.map((l) => l.end)];
  const extent = points.reduce(
    (m, p) =>
      Math.max(
        m,
        view === "top"
          ? Math.hypot(p[0], p[2])
          : Math.max(Math.abs(p[2]), p[1]),
      ),
    0,
  );
  return Math.max(8, extent * 1.12);
}

/** Index of the trace sample at `t`, for the swept part of the path. */
export const traceIndex = (input: RadarInput) =>
  Math.round(Math.min(1, Math.max(0, input.t)) * (input.trace.length - 1));

export function drawRadar(
  canvas: HTMLCanvasElement,
  view: RadarView,
  input: RadarInput,
  palette: RadarPalette,
): void {
  const ctx = context(canvas);
  if (!ctx || input.trace.length < 2) return;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 132;
  // Painted into the bitmap, not CSS, so the pane is pixel-stable at rest.
  const wash = ctx.createRadialGradient(
    w / 2,
    h / 2,
    0,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.6,
  );
  wash.addColorStop(0, palette.wash[0]);
  wash.addColorStop(1, palette.wash[1]);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  // Too small to read: the wash alone stands in until the pane is wider.
  if (w < RADAR_MIN_SIZE || h < RADAR_MIN_SIZE) return;
  grid(ctx, view, w, h, palette.grid);
  const at = radarProjector(view, w, h, radarRange(input, view));
  const points = input.trace.map(at);
  const now = traceIndex(input);
  const origin = at([0, 0, 0]);

  if (view === "top") {
    // Holodeck's swept wedge from the start bearing to the current one.
    const current = points[now];
    const wedge = sweptWedge(points, origin, now);
    const r = Math.hypot(current.x - origin.x, current.y - origin.y);
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = palette.path;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.arc(origin.x, origin.y, r, wedge.start, wedge.end, wedge.anticlockwise);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  input.layers.forEach((layer, i) => {
    const color = palette.layers[i % palette.layers.length];
    const end = at(layer.end);
    ctx.save();
    ctx.globalAlpha = 0.18 + layer.weight * 0.5;
    ctx.strokeStyle = color;
    ctx.setLineDash([2, 4]);
    polyline(ctx, [origin, end]);
    ctx.restore();
    marker(ctx, end, color, 3.2, "dot", 0.3 + layer.weight * 0.6);
  });

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = palette.end;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  polyline(ctx, points.slice(now));
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = palette.path;
  ctx.lineWidth = 2;
  polyline(ctx, points.slice(0, now + 1));
  ctx.restore();

  const current = points[now];
  const end = points[points.length - 1];
  if (view === "top") {
    ctx.save();
    ctx.strokeStyle = palette.path;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([3, 3]);
    polyline(ctx, [origin, current]);
    ctx.restore();
  }
  marker(ctx, origin, palette.subject, 4, "dot");
  marker(ctx, points[0], palette.start, 3.2, "dot");
  marker(ctx, end, palette.end, 5, "diamond");
  marker(ctx, current, palette.path, 5.5, "dot");
  if (view === "side")
    label(ctx, "GROUND", { x: origin.x + 7, y: origin.y - 6 }, palette.start);
  label(ctx, "NOW", { x: current.x + 7, y: current.y - 6 }, palette.path);
  label(ctx, "END", { x: end.x + 7, y: end.y + 12 }, palette.end);
}
