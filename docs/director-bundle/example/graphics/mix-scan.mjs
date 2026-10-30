// A surveillance read of a subject in the Signal construction look: dotted
// corner marks, a dotted reticle that closes on the target over one beat and
// locks on the next, a dotted leader to a readout at the frame's edge
// (subject name, lock) and mono camera and time code readouts. Pair it with the `wire-scan` filter for the wireframe sweep. Pure
// in time.
const clamp = (x) => Math.min(1, Math.max(0, x));
const outCubic = (x) => 1 - Math.pow(1 - x, 3);
const pad = (n) => String(Math.floor(n)).padStart(2, "0");

export function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const { color, accent, text, x, y, bpm } = parameters;
  const beat = 60 / bpm;
  const u = height / 360;
  const mono = (px) => `400 ${Math.round(px * u)}px "IBM Plex Mono", monospace`;
  const dots = (cx, cy, r, from, to) => {
    for (let a = from; a < to; a += 0.09)
      ctx.fillRect(
        cx + Math.cos(a) * r - 0.8 * u,
        cy + Math.sin(a) * r - 0.8 * u,
        1.6 * u,
        1.6 * u,
      );
  };
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.globalAlpha = outCubic(clamp(t / 0.15));
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(1, u);
      const m = 22 * u,
        l = 26 * u;
      for (const [cx, cy, sx, sy] of [
        [m, m, 1, 1],
        [width - m, m, -1, 1],
        [m, height - m, 1, -1],
        [width - m, height - m, -1, -1],
      ])
        for (let d = 0; d <= l; d += 4 * u) {
          ctx.fillRect(cx + sx * d - 0.7 * u, cy - 0.7 * u, 1.4 * u, 1.4 * u);
          ctx.fillRect(cx - 0.7 * u, cy + sy * d - 0.7 * u, 1.4 * u, 1.4 * u);
        }
      const close = outCubic(clamp(t / beat));
      const locked = t >= beat;
      const tx = x * width,
        ty = y * height;
      const rx = tx + (1 - close) * width * 0.16,
        ry = ty - (1 - close) * height * 0.12;
      const r = (30 + 46 * (1 - close)) * u;
      const pulse = locked ? Math.exp(-((t - beat) % beat) * 6) : 0;
      ctx.fillStyle = locked ? accent : color;
      const spin = t * 1.2;
      for (let k = 0; k < 4; k++)
        dots(
          rx,
          ry,
          r * (1 + pulse * 0.08),
          spin + k * 1.571,
          spin + k * 1.571 + 1.1,
        );
      ctx.strokeStyle = locked ? accent : color;
      ctx.beginPath();
      ctx.moveTo(rx - r * 0.3, ry);
      ctx.lineTo(rx + r * 0.3, ry);
      ctx.moveTo(rx, ry - r * 0.3);
      ctx.lineTo(rx, ry + r * 0.3);
      ctx.stroke();
      // The readout sits at the frame's edge on a dark plate, joined to the
      // reticle by a dotted leader, so the words never cover the subject.
      const pw = 132 * u,
        lx = width - m - pw - 6 * u,
        ly = Math.min(Math.max(ry - 22 * u, m + 30 * u), height - m - 80 * u);
      ctx.fillStyle = color;
      for (let d = r + 6 * u; rx + d < lx - 10 * u; d += 4 * u)
        ctx.fillRect(rx + d, ry - 0.6 * u, 1.2 * u, 1.2 * u);
      ctx.fillStyle = "rgba(21,27,17,0.72)";
      ctx.fillRect(lx - 8 * u, ly - 6 * u, pw, 50 * u);
      ctx.fillStyle = locked ? accent : color;
      ctx.fillRect(lx - 8 * u, ly - 6 * u, 2 * u, 50 * u);
      ctx.fillStyle = color;
      ctx.textBaseline = "top";
      ctx.font = mono(8);
      ctx.fillText(locked ? "LOCKED" : "ACQUIRING", lx, ly);
      ctx.font = mono(13);
      ctx.fillText(text, lx, ly + 11 * u);
      ctx.font = mono(7);
      ctx.fillText(
        `TGT ${x.toFixed(2)} ${y.toFixed(2)}  ${Math.round(close * 98)}%`,
        lx,
        ly + 30 * u,
      );
      const blink = Math.floor(t / (beat / 2)) % 2 === 0;
      ctx.font = mono(9);
      ctx.fillText(`${blink ? "●" : "○"} REC  CAM-03`, m + 8 * u, m + 8 * u);
      ctx.textAlign = "right";
      const f = Math.floor((t % 1) * 30);
      ctx.fillText(
        `${pad(t / 3600)}:${pad((t / 60) % 60)}:${pad(t % 60)}:${pad(f)}`,
        width - m - 8 * u,
        height - m - 18 * u,
      );
      ctx.restore();
    },
    dispose() {},
  };
}
