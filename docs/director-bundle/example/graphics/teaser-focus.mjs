// A focus box on one control in the studio footage: the frame outside it
// dims, a dotted box traces itself around the control (x, y, w, h as
// fractions of the frame), corner brackets land on the beat and a label
// tag names it. Retarget it by editing the box; `view` follows the
// slice's camera move, so the box stays on its control. Pure in time: everything is
// a function of the layer's time. Original, in the Signal look.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const out = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

// The slice's camera move (`viewParameter` in shared/templates/mix.ts):
// "fps,aFrames,bFrames,offsetFrames;s,dx,dy;s,dx,dy;s,dx,dy". A point of
// the footage (fractions of the frame) lands on screen where the moved
// picture shows it. Empty: the footage is not moved.
export function parseView(view) {
  if (!view) return null;
  const [head, ...keys] = view.split(";");
  const [fps, a, b, offset] = head.split(",").map(Number);
  const k = keys.map((s) => s.split(",").map(Number));
  if (
    k.length !== 3 ||
    ![fps, a, b, offset, ...k.flat()].every(Number.isFinite)
  )
    return null;
  return { fps, a, b, offset, keys: k };
}
export function viewAt(v, t) {
  if (!v) return { s: 1, dx: 0, dy: 0 };
  const f = Math.round(t * v.fps) + v.offset;
  const [from, to, k] =
    f < v.a
      ? [v.keys[0], v.keys[1], Math.max(0, f) / Math.max(1, v.a - 1)]
      : [v.keys[1], v.keys[2], Math.min(1, (f - v.a) / Math.max(1, v.b - 1))];
  const mix = (i) => from[i] + (to[i] - from[i]) * Math.min(1, k);
  return { s: mix(0), dx: mix(1), dy: mix(2) };
}
const place = (m, x, y) => ({
  x: 0.5 + (x - 0.5) * m.s + m.dx,
  y: 0.5 + (y - 0.5) * m.s + m.dy,
});

export function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const p = parameters;
  const u = width / 1280;
  const pad = 6 * u;
  const view = parseView(p.view);
  const font = `500 ${12 * u}px "IBM Plex Mono", monospace`;
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      ctx.clearRect(0, 0, width, height);
      const m = viewAt(view, t);
      const tl = place(m, p.x, p.y);
      const bx = tl.x * width - pad,
        by = tl.y * height - pad,
        bw = p.w * m.s * width + 2 * pad,
        bh = p.h * m.s * height + 2 * pad;
      const fade = p.fadeAt > 0 ? 1 - clamp((t - p.fadeAt) / 0.3, 0, 1) : 1;
      if (fade <= 0) return;
      const draw = out(t / p.draw);
      // The dim, with the box cut out of it.
      ctx.globalAlpha = fade;
      ctx.fillStyle = `rgba(12,14,12,${p.dim * draw})`;
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.rect(bx + bw, by, -bw, bh);
      ctx.fill("evenodd");
      // The dotted box, traced clockwise from the top-left corner.
      const perimeter = 2 * (bw + bh);
      ctx.save();
      ctx.setLineDash([1.6 * u, 4.4 * u]);
      ctx.lineCap = "round";
      ctx.lineWidth = 2.2 * u;
      ctx.strokeStyle = p.color;
      ctx.beginPath();
      let left = perimeter * draw;
      const pts = [
        [bx, by],
        [bx + bw, by],
        [bx + bw, by + bh],
        [bx, by + bh],
        [bx, by],
      ];
      ctx.moveTo(bx, by);
      for (let i = 1; i < pts.length && left > 0; i++) {
        const [ax, ay] = pts[i - 1],
          [qx, qy] = pts[i];
        const len = Math.hypot(qx - ax, qy - ay);
        const k = Math.min(1, left / len);
        ctx.lineTo(ax + (qx - ax) * k, ay + (qy - ay) * k);
        left -= len;
      }
      ctx.stroke();
      ctx.restore();
      // Corner brackets, landing with a small overshoot once the box is drawn.
      const land = out((t - p.draw * 0.7) / 0.25);
      if (land > 0) {
        const c = 12 * u,
          o = (1 - land) * 10 * u;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.4 * u;
        ctx.globalAlpha = fade * land;
        for (const [cx, cy, sx, sy] of [
          [bx, by, 1, 1],
          [bx + bw, by, -1, 1],
          [bx + bw, by + bh, -1, -1],
          [bx, by + bh, 1, -1],
        ]) {
          const ox = cx - sx * o,
            oy = cy - sy * o;
          ctx.beginPath();
          ctx.moveTo(ox, oy + sy * c);
          ctx.lineTo(ox, oy);
          ctx.lineTo(ox + sx * c, oy);
          ctx.stroke();
        }
      }
      // The label tag, typed out above the box (below it near the top edge).
      const typed = Math.round(
        p.label.length * clamp((t - p.draw * 0.5) / 0.4, 0, 1),
      );
      if (typed > 0) {
        const text = p.label.slice(0, typed);
        ctx.font = font;
        const tw = ctx.measureText(p.label).width + 16 * u;
        const th = 22 * u;
        const above = by - th - 6 * u > 0;
        const tx = clamp(bx, 4 * u, width - tw - 4 * u);
        const ty = above ? by - th - 6 * u : by + bh + 6 * u;
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        ctx.fillRect(tx, ty, tw, th);
        ctx.fillStyle = "#0c0e0c";
        ctx.textBaseline = "middle";
        ctx.fillText(text, tx + 8 * u, ty + th / 2 + 0.5 * u);
      }
      ctx.globalAlpha = 1;
    },
    dispose() {},
  };
}
