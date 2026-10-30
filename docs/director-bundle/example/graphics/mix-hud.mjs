// A thin HUD on the frame's edges in the Signal construction look: dotted
// side rails whose beat dot lights on each beat, a mono readout of the
// piece and the bar, a small track credit and a dotted progress line along
// the bottom across `seconds`. Pure in time.
const clamp = (x) => Math.min(1, Math.max(0, x));
const pad = (n) => String(n).padStart(2, "0");

export function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const { color, accent, bpm, text, credit, seconds } = parameters;
  const beat = 60 / bpm;
  const u = height / 360;
  const m = 12 * u;
  const dot = (x, y, s) => ctx.fillRect(x - s / 2, y - s / 2, s, s);
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      ctx.clearRect(0, 0, width, height);
      const n = Math.floor(t / beat + 1e-6);
      const pulse = Math.exp(-(t - n * beat) * 7);
      ctx.save();
      for (const x of [m, width - m]) {
        for (let k = 0; k < 16; k++) {
          const y = height * 0.3 + (k * height * 0.4) / 15;
          const lit = Math.floor(k / 4) === n % 4;
          ctx.fillStyle = lit ? accent : color;
          ctx.globalAlpha = lit ? 0.55 + 0.45 * pulse : 0.35;
          dot(x, y, (lit ? 1.6 + pulse : 1.2) * u);
        }
      }
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = color;
      ctx.font = `400 ${Math.round(8 * u)}px "IBM Plex Mono", monospace`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillText(text, m + 10 * u, m);
      ctx.textAlign = "right";
      ctx.fillText(
        `${bpm} BPM  BAR ${pad(Math.floor(n / 4) + 1)}.${(n % 4) + 1}`,
        width - m - 10 * u,
        m,
      );
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.globalAlpha = 0.6;
      ctx.fillText(credit, m + 10 * u, height - m - 5 * u);
      const y = height - m,
        x0 = width * 0.35,
        span = width * 0.6 - 10 * u;
      const p = clamp(t / seconds);
      for (let d = 0; d <= span; d += 4 * u) {
        const done = d <= span * p;
        ctx.globalAlpha = done ? 0.8 : 0.3;
        ctx.fillStyle = done ? accent : color;
        dot(x0 + d, y, 1.4 * u);
      }
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      ctx.fillStyle = accent;
      ctx.fillRect(x0 + span * p - 1 * u, y - 4 * u, 2 * u, 8 * u);
      ctx.restore();
    },
    dispose() {},
  };
}
