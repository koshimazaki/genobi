// A line typed on the beat: `chars` characters land every step, a step
// being one beat divided by `division` (1 a beat, 2 an eighth, 4 a
// sixteenth; 3 a triplet, at `bpm`), from the layer's start; a block cursor in
// `cursorColor` follows the last one, and blinks on the step once the line
// is done. The finished line is centred on (x, y), so it types out from its
// left edge without moving. Words are in `color` over a `shadow` offset, as
// the pixel cards set them. `font` is a CSS family stack the Director
// resolves to a bundled face. Pure in time: every frame is a function of
// the layer's time alone. Original, in the Signal look.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export async function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const p = parameters;
  const face = `400 ${p.size}px ${p.font}`;
  await globalThis.document?.fonts?.load(face, p.text);
  ctx.font = face;
  const full = ctx.measureText(p.text).width;
  const left = clamp(p.x * width - full / 2, 0, Math.max(0, width - full));
  const y = p.y * height;
  const step = 60 / p.bpm / p.division;
  const off = Math.max(2, Math.round(p.size / 16));
  const cursor = {
    w: Math.round(p.size * 0.625),
    h: Math.round(p.size * 0.875),
  };
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      ctx.clearRect(0, 0, width, height);
      const n = Math.floor(t / step);
      const shown = Math.min(p.text.length, (n + 1) * p.chars);
      const text = p.text.slice(0, shown).trimEnd();
      ctx.font = face;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      if (text) {
        ctx.fillStyle = p.shadow;
        ctx.fillText(text, left + off, y + off);
        ctx.fillStyle = p.color;
        ctx.fillText(text, left, y);
      }
      const done = shown >= p.text.length;
      if (!done || n % 2 === 0) {
        const cx = left + (text ? ctx.measureText(text).width : 0) + off * 2;
        ctx.fillStyle = p.cursorColor;
        ctx.fillRect(
          Math.round(cx),
          Math.round(y - cursor.h / 2),
          cursor.w,
          cursor.h,
        );
      }
    },
    dispose() {},
  };
}
