/* global Path2D */
// Authored, persistent vector primitives. Rendering transforms these paths at
// an explicit time; it never traces frames or changes their path topology.
// The Director's video compositor rasterizes this editable recipe to Canvas.
const GEOMETRY = {
  petal: "M-6-99Q-6-105 0-105Q6-105 6-99V-74Q6-68 0-68Q-6-68-6-74Z",
  blade: "M0-59L12-33L0-20L-5-38Z",
  orbit: "M4-57A4 4 0 1 0-4-57A4 4 0 1 0 4-57Z",
  hub: "M12 0A12 12 0 1 0-12 0A12 12 0 1 0 12 0Z",
  rim: "M110 0A110 110 0 1 0-110 0A110 110 0 1 0 110 0Z",
};

export function createLayer({ canvas, width, height, parameters: p }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The kinetic title needs a 2D canvas.");
  const paths = Object.fromEntries(
    Object.entries(GEOMETRY).map(([id, data]) => [id, new Path2D(data)]),
  );
  const unit = Math.min(width, height);
  const radius = unit * 0.26;
  const wide = width >= height;
  const centerY = height * (wide ? 0.4 : 0.39);
  const textY = height * (wide ? 0.79 : 0.68);
  const fitText = (text, size, y, color) => {
    ctx.font = `400 ${size}px ${p.font}, monospace`;
    const measured = ctx.measureText(text).width;
    if (measured > width * 0.84)
      ctx.font = `400 ${(size * width * 0.84) / measured}px ${p.font}, monospace`;
    ctx.fillStyle = color;
    ctx.fillText(text, width / 2, y);
  };
  const repeat = (path, count, rotation, color, alpha) => {
    ctx.save();
    ctx.rotate(rotation);
    ctx.fillStyle = color;
    ctx.globalAlpha = p.mix * alpha;
    for (let i = 0; i < count; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / count);
      ctx.fill(path);
      ctx.restore();
    }
    ctx.restore();
  };
  return {
    output: canvas,
    render({ timeSeconds }) {
      ctx.clearRect(0, 0, width, height);
      if (p.mix <= 0) return;
      const phase = Math.max(0, timeSeconds) * p.speed;
      ctx.save();
      ctx.translate(width / 2, centerY);
      ctx.scale(radius / 110, radius / 110);
      ctx.globalAlpha = p.mix * 0.35;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 0.75;
      ctx.stroke(paths.rim);
      repeat(paths.petal, p.shapeCount, phase, p.accent, 1);
      repeat(paths.blade, 8, -phase * 1.3, p.color, 0.85);
      repeat(paths.orbit, 4, phase * 0.7 + Math.PI / 12, p.accent, 0.9);
      ctx.globalAlpha = p.mix;
      ctx.fillStyle = p.accent;
      ctx.fill(paths.hub);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = p.mix;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      fitText(p.text, unit * 0.065, textY, p.color);
      ctx.globalAlpha = p.mix * 0.7;
      fitText(p.subtitle, unit * 0.021, textY + unit * 0.065, p.accent);
      ctx.restore();
    },
    dispose() {},
  };
}
