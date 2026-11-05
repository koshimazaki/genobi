// A comic speech bubble that pops out beside a point of the picture: a
// rounded bubble with a thick outline and a tail whose tip sits just off the
// anchor (x, y as fractions of the frame), the words inside it. `direction`
// says which side of the anchor the bubble sits on (up-left, up-right,
// down-left or down-right); " / " breaks a line. It grows from the tail's tip
// with an overshoot over `duration` seconds, then holds. `font` is a key for
// one of the studio's bundled faces. Pure in time: every frame is a function
// of the layer's time alone. Original, in the Signal look.
const FONTS = {
  "IBM Plex Mono": (size) => `400 ${size}px "IBM Plex Mono", monospace`,
  "Instrument Sans": (size) =>
    `700 ${size}px "Instrument Sans Variable", sans-serif`,
};
const clamp = (x) => Math.min(1, Math.max(0, x));
// An overshooting ease out: 0 at 0, 1 at 1, about 1.1 near 0.7.
const outBack = (x) => {
  const k = 1.70158;
  return 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2);
};

/** Where the bubble sits: its box and the tail's base, before scaling. */
export function bubbleLayout({ width, height, x, y, size, direction }, box) {
  const ax = x * width,
    ay = y * height;
  const up = direction.startsWith("up");
  const left = direction.endsWith("left");
  // The tail is two line heights long, so the bubble clears the anchor.
  const reach = size * 1.6;
  const tipGap = size * 0.25;
  const bx = left
    ? ax - reach - box.w + box.w * 0.25
    : ax + reach - box.w * 0.25;
  const by = up ? ay - reach - box.h : ay + reach;
  // Keep the bubble inside the frame; the tail stretches to follow.
  const cx = Math.min(width - box.w - size * 0.3, Math.max(size * 0.3, bx));
  const cy = Math.min(height - box.h - size * 0.3, Math.max(size * 0.3, by));
  const tip = {
    x: ax + (left ? -tipGap : tipGap),
    y: ay + (up ? -tipGap : tipGap),
  };
  const baseX = Math.min(
    cx + box.w - size,
    Math.max(cx + size, left ? cx + box.w * 0.7 : cx + box.w * 0.3),
  );
  const baseY = up ? cy + box.h : cy;
  return { box: { x: cx, y: cy, w: box.w, h: box.h }, tip, baseX, baseY };
}

export async function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const { text, font, color, fill, x, y, size, direction, duration } =
    parameters;
  const face = FONTS[font](size);
  await globalThis.document?.fonts?.load(face, text || " ");
  ctx.font = face;
  const lines = text.split(" / ");
  const leading = size * 1.15;
  const textW = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
  const pad = size * 0.55;
  const box = { w: textW + pad * 2, h: leading * lines.length + pad * 1.4 };
  const {
    box: b,
    tip,
    baseX,
    baseY,
  } = bubbleLayout({ width, height, x, y, size, direction }, box);
  const stroke = Math.max(2, size * 0.09);
  const radius = Math.min(b.h / 2, size * 0.9);
  const half = size * 0.45;
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      ctx.clearRect(0, 0, width, height);
      const p = clamp(t / duration);
      if (p <= 0) return;
      const s = outBack(p);
      ctx.save();
      // Grow from the tail's tip.
      ctx.translate(tip.x, tip.y);
      ctx.scale(s, s);
      ctx.translate(-tip.x, -tip.y);
      ctx.globalAlpha = clamp(p * 4);
      ctx.lineJoin = "round";
      ctx.lineWidth = stroke;
      ctx.strokeStyle = color;
      ctx.fillStyle = fill;
      // The bubble and its tail as one outline, so no seam shows.
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, radius);
      ctx.moveTo(baseX - half, baseY);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(baseX + half, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Cover the outline where the tail meets the bubble.
      ctx.beginPath();
      ctx.moveTo(baseX - half + stroke, baseY);
      ctx.lineTo(baseX + half - stroke, baseY);
      ctx.lineWidth = stroke * 1.4;
      ctx.strokeStyle = fill;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = face;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      lines.forEach((line, i) => {
        const ly = b.y + b.h / 2 + (i - (lines.length - 1) / 2) * leading;
        ctx.fillText(line, b.x + b.w / 2, ly);
      });
      ctx.restore();
    },
    dispose() {},
  };
}
