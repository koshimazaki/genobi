// A pointer that walks the studio footage: it glides between the points of
// `path` ("t:x,y / t:x,y", seconds on the layer and fractions of the frame)
// and clicks at the times in `clicks` ("t / t"): it dips, and a ring and a
// dotted halo spread from the tip. The footage has no pointer of its own, so
// a retimed or reframed shot moves the pointer by editing these numbers.
// `view` follows the slice's camera move, so the tip stays on its control.
// Pure in time: everything is a function of the layer's time. Original.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const inOut = (x) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export const parsePath = (path) =>
  path
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [t, xy] = s.split(":");
      const [x, y] = (xy ?? "").split(",").map(Number);
      return { t: Number(t), x, y };
    })
    .filter((k) => [k.t, k.x, k.y].every(Number.isFinite))
    .sort((a, b) => a.t - b.t);
export const parseClicks = (clicks) =>
  clicks
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);

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

/** Where the tip is at time t: eased between path points, held at the ends. */
export function pointAt(keys, t) {
  if (!keys.length) return null;
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++)
    if (t <= keys[i].t) {
      const a = keys[i - 1],
        b = keys[i];
      const k = inOut((t - a.t) / Math.max(1e-6, b.t - a.t));
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  return keys[keys.length - 1];
}

export function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const keys = parsePath(parameters.path);
  const clicks = parseClicks(parameters.clicks);
  const view = parseView(parameters.view);
  const u = (parameters.size * width) / 1280;
  // The arrow, tip at the origin, 1 unit = 1 px at 1280 wide and size 1.
  const arrow = [
    [0, 0],
    [0, 21],
    [5.2, 16.4],
    [9, 24.6],
    [12.6, 23],
    [8.9, 15],
    [15.6, 15],
  ];
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      ctx.clearRect(0, 0, width, height);
      const tip = pointAt(keys, t);
      if (!tip) return;
      const at = place(viewAt(view, t), tip.x, tip.y);
      const x = at.x * width,
        y = at.y * height;
      const fade = clamp(t / 0.2, 0, 1);
      let dip = 0;
      for (const c of clicks) {
        const d = t - c;
        if (d < 0 || d > 0.7) continue;
        // Ring: a solid stroke that widens and fades; halo: dotted, slower.
        const k = d / 0.7;
        ctx.globalAlpha = (1 - k) * fade;
        ctx.strokeStyle = parameters.color;
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.arc(x, y, (6 + 30 * Math.sqrt(k)) * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([1.5 * u, 4 * u]);
        ctx.lineCap = "round";
        ctx.lineWidth = 2.4 * u;
        ctx.beginPath();
        ctx.arc(x, y, (12 + 48 * k) * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (d < 0.18) dip = Math.max(dip, Math.sin((d / 0.18) * Math.PI));
      }
      ctx.globalAlpha = fade;
      const s = u * (1 - 0.18 * dip);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.beginPath();
      arrow.forEach(([ax, ay], i) =>
        i ? ctx.lineTo(ax, ay) : ctx.moveTo(ax, ay),
      );
      ctx.closePath();
      ctx.shadowColor = "rgba(0,0,0,.45)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = parameters.fill;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.lineJoin = "round";
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = parameters.outline;
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    },
    dispose() {},
  };
}
