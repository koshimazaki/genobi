// The `scan` surveillance read with its own lock line: dotted corner marks,
// a dotted reticle that closes on the target over one beat and locks on the
// next, a dotted leader to a readout at the frame's edge, and mono camera and
// time code readouts. While it closes, the readout says ACQUIRING over
// `text` on a dark plate; once locked, the plate turns `accent` and the
// readout says `locked` (" / " breaks a line), in `color`. A copy of
// mix-scan.mjs with those two changes, so the Dimensions mix and Bloom,
// pinned to that recipe's hash, stay as they are. Pure in time.
const clamp = (x) => Math.min(1, Math.max(0, x));
const outCubic = (x) => 1 - Math.pow(1 - x, 3);
const pad = (n) => String(Math.floor(n)).padStart(2, "0");

export function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const { color, accent, text, locked: lockedText, x, y, bpm } = parameters;
  const beat = 60 / bpm;
  const u = height / 360;
  const mono = (px) => `400 ${Math.round(px * u)}px "IBM Plex Mono", monospace`;
  const lines = lockedText.split(" / ");
  ctx.font = mono(13);
  const widest = Math.max(
    ctx.measureText(text).width,
    ...lines.map((l) => ctx.measureText(l).width),
  );
  // The plate fits the longest line, from the scan's 132 units up.
  const pw = Math.max(132 * u, widest + 20 * u);
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
      // The readout at the frame's edge, joined to the reticle by a dotted
      // leader, so the words never cover the subject.
      const rows = locked ? lines : [text];
      const ph = (locked ? 18 : 30) * u + rows.length * 16 * u + 6 * u;
      const lx = width - m - pw - 6 * u,
        ly = Math.min(
          Math.max(ry - 22 * u, m + 30 * u),
          height - m - ph - 30 * u,
        );
      ctx.fillStyle = color;
      for (let d = r + 6 * u; rx + d < lx - 10 * u; d += 4 * u)
        ctx.fillRect(rx + d, ry - 0.6 * u, 1.2 * u, 1.2 * u);
      ctx.fillStyle = locked ? accent : "rgba(12,14,12,0.72)";
      ctx.fillRect(lx - 8 * u, ly - 6 * u, pw, ph);
      ctx.fillStyle = color;
      ctx.fillRect(lx - 8 * u, ly - 6 * u, 2 * u, ph);
      ctx.textBaseline = "top";
      let at = ly;
      if (!locked) {
        ctx.font = mono(8);
        ctx.fillText("ACQUIRING", lx, at);
        at += 11 * u;
      }
      ctx.font = mono(13);
      for (const row of rows) {
        ctx.fillText(row, lx, at);
        at += 16 * u;
      }
      ctx.font = mono(7);
      ctx.fillText(
        `TGT ${x.toFixed(2)} ${y.toFixed(2)}  ${Math.round(close * 98)}%`,
        lx,
        at + 3 * u,
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
