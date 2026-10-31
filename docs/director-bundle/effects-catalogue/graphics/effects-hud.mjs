// Original frame instrumentation, separate from the lens filter beneath it.
// Readouts are explicitly decorative. No tracked pose or live telemetry is used.
export function createLayer({ canvas, width, height, parameters: p }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The HUD needs a 2D canvas.");
  const unit = Math.min(width, height) / 540;
  const margin = 34 * unit;
  const span = 28 * unit;
  const line = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const text = (value, x, y, size, align = "left", maxWidth = width * 0.8) => {
    ctx.font = `400 ${size * unit}px ${p.font}, monospace`;
    ctx.textAlign = align;
    ctx.fillText(value, x, y, maxWidth);
  };
  return {
    output: canvas,
    render({ timeSeconds }) {
      ctx.clearRect(0, 0, width, height);
      if (p.mix <= 0) return;
      const t = Math.max(0, timeSeconds) * p.speed;
      ctx.save();
      ctx.globalAlpha = p.mix;
      ctx.strokeStyle = p.accent;
      ctx.fillStyle = p.accent;
      ctx.lineWidth = Math.max(0.5, unit);
      for (const x of [margin, width - margin])
        for (const y of [margin, height - margin]) {
          line(x, y, x + (x < width / 2 ? span : -span), y);
          line(x, y, x, y + (y < height / 2 ? span : -span));
        }
      const labelY = margin + 17 * unit;
      text(p.label, margin + 12 * unit, labelY, 14, "left", width * 0.58);
      text("SIM", width - margin - 12 * unit, labelY, 12, "right");
      ctx.globalAlpha = p.mix * 0.65;
      text("SIMULATED READOUT", margin + 12 * unit, labelY + 18 * unit, 8);
      text(
        `PHASE ${t.toFixed(2)}`,
        width - margin - 12 * unit,
        height - margin - 12 * unit,
        10,
        "right",
      );
      text("OPTICAL STUDY", margin + 12 * unit, height - margin - 12 * unit, 9);
      const left = margin + 12 * unit;
      const right = width - left;
      for (let i = 0; i < 15; i++) {
        const y = height * (0.25 + (i * 0.5) / 14);
        const length = (i % 3 === 0 ? 10 : 5) * unit;
        line(left, y, left + length, y);
        line(right, y, right - length, y);
      }
      ctx.globalAlpha = p.mix * 0.85;
      const cy = height * (0.3 + ((Math.sin(t * 0.9) + 1) / 2) * 0.4);
      ctx.fillRect(left - 2 * unit, cy - 2 * unit, 8 * unit, 4 * unit);
      const cx = width / 2 + Math.sin(t * 0.7) * 12 * unit;
      const centerY = height / 2 + Math.cos(t * 0.6) * 8 * unit;
      for (const sign of [-1, 1]) {
        line(cx + sign * 13 * unit, centerY, cx + sign * 26 * unit, centerY);
        line(cx, centerY + sign * 13 * unit, cx, centerY + sign * 26 * unit);
      }
      ctx.restore();
    },
    dispose() {},
  };
}
