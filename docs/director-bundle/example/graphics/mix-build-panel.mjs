// A side panel that builds itself, in the visual language of the Signal
// construction theme (after Jakub Antalik's skeleton-texts effect from
// Transitions.dev; this is an original canvas drawing, not that code): a
// dotted outline is traced, skeleton bars stand in for
// each line, then the words resolve out of scrambled glyphs, and a step dot
// pulses on the beat. " / " separates the lines. Pure in time.
const SCRAMBLE = "▮▯░▒01/<>=+*#";
const clamp = (x) => Math.min(1, Math.max(0, x));
const outCubic = (x) => 1 - Math.pow(1 - x, 3);
const hash = (a, b) => {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

export function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const {
    side,
    title,
    lines: text,
    color,
    muted,
    accent,
    bpm,
    duration,
  } = parameters;
  const lines = text.split(" / ").filter(Boolean);
  const u = height / 360;
  const row = 12 * u;
  // A narrow column at the frame's edge, beside the subject, not over it.
  const w = width * 0.2,
    h = row * (lines.length + 2.6);
  const x = side === "left" ? width * 0.035 : width * 0.965 - w;
  const y = height * 0.2;
  const beat = 60 / bpm;
  const perimeter = 2 * (w + h);
  // A point at distance d along the outline, clockwise from the top left.
  const along = (d) => {
    if (d < w) return [x + d, y];
    if (d < w + h) return [x + w, y + d - w];
    if (d < 2 * w + h) return [x + w - (d - w - h), y + h];
    return [x, y + h - (d - 2 * w - h)];
  };
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      const p = t / duration;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      // The dotted outline, traced, with a bright moving head.
      const traced = outCubic(clamp(p / 0.4)) * perimeter;
      ctx.fillStyle = muted;
      const gap = 4 * u;
      for (let d = 0; d < traced; d += gap) {
        const [px, py] = along(d);
        ctx.fillRect(px - 0.75 * u, py - 0.75 * u, 1.5 * u, 1.5 * u);
      }
      if (traced < perimeter) {
        const [hx, hy] = along(traced);
        ctx.fillStyle = accent;
        ctx.fillRect(hx - 2 * u, hy - 2 * u, 4 * u, 4 * u);
      }
      // Skeleton bars, then the words resolving out of scrambled glyphs.
      ctx.font = `400 ${Math.round(8.5 * u)}px "IBM Plex Mono", monospace`;
      ctx.textBaseline = "middle";
      const all = [title, ...lines];
      all.forEach((line, i) => {
        const ly = y + row * (i + 1);
        const lx = x + 8 * u;
        const grow = outCubic(clamp((p - 0.2 - i * 0.05) / 0.3));
        const resolve = clamp((p - 0.5 - i * 0.05) / 0.35);
        const barW = Math.min(w - 16 * u, ctx.measureText(line).width);
        ctx.globalAlpha = 0.35 * grow * (1 - resolve);
        ctx.fillStyle = muted;
        ctx.beginPath();
        ctx.roundRect(lx, ly - 3 * u, barW * grow, 6 * u, 3 * u);
        ctx.fill();
        if (resolve <= 0) return;
        const shown = Math.ceil(line.length * resolve);
        let out = line.slice(0, shown);
        if (resolve < 1)
          out +=
            SCRAMBLE[Math.floor(hash(i, Math.floor(t * 30)) * SCRAMBLE.length)];
        ctx.globalAlpha = 1;
        ctx.fillStyle = i === 0 ? color : muted;
        ctx.fillText(out, lx, ly);
        if (i === 0 && resolve >= 1) {
          // The heading's dotted rule.
          for (let d = 0; d < w - 16 * u; d += 3 * u)
            ctx.fillRect(lx + d, ly + 6 * u, 1 * u, 1 * u);
        }
      });
      // The step dot, pulsing on the beat once the panel is built.
      if (p >= 1) {
        const pulse = 0.6 + 0.4 * Math.exp(-(t % beat) * 6);
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(
          x + 8 * u + 2.5 * u,
          y + h - 7 * u,
          2.5 * u * pulse,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.fillStyle = muted;
        ctx.fillText("READY", x + 16 * u, y + h - 7 * u);
      }
      ctx.restore();
    },
    dispose() {},
  };
}
