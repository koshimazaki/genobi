// An impact screen for a hit: a flash, a fat word that slams in from
// oversize with a decaying shake, a pulse on each beat while it holds, then
// a snap shut after `beats` beats. " / " breaks a line. `font` is a CSS
// family stack, so a font the person has installed (a local headline face)
// is tried first and a bundled one is the fallback. Pure in time: the shake
// is a fixed function of the time, never Math.random. Some headline faces
// draw only lower-case letters (their capitals fall through to the next
// family); the words are then set in lower case so that face draws them.
const clamp = (x) => Math.min(1, Math.max(0, x));
const outCubic = (x) => 1 - Math.pow(1 - x, 3);
const wobble = (t, k) => Math.sin(t * 91.7 + k * 12.9) * Math.sin(t * 57.3 + k);

export async function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const { text, font, weight, color, accent, bpm, size, beats } = parameters;
  const beat = 60 / bpm;
  const hold = beats * beat;
  const face = (px, family = font) => `${weight} ${px}px ${family}`;
  await globalThis.document?.fonts?.load(face(size), text || " ");
  const rest = font.split(",").slice(1).join(",").trim() || "sans-serif";
  const width_ = (s, family) => {
    ctx.font = face(size, family);
    return ctx.measureText(s).width;
  };
  // Compare the letters alone: a face can carry its own punctuation.
  const letters = text.replace(/[^\p{L}]/gu, "");
  const upper = letters.toUpperCase(),
    lower = letters.toLowerCase();
  const lowerOnly =
    upper !== lower &&
    width_(upper, font) === width_(upper, rest) &&
    width_(lower, font) !== width_(lower, rest);
  const lines = (lowerOnly ? text.toLowerCase() : text).split(" / ");
  ctx.font = face(size);
  const widest = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
  // The widest line fits 86% of the frame.
  const fitted = Math.min(size, (size * width * 0.86) / widest);
  const leading = fitted * 1.02;
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      ctx.clearRect(0, 0, width, height);
      const snap = clamp((t - hold) / 0.09);
      if (snap >= 1) return;
      const flash = Math.exp(-t * 16);
      if (flash > 0.02) {
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.55 * flash;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }
      const slam = outCubic(clamp(t / Math.min(0.12, beat * 0.3)));
      const pulse = t > beat ? Math.exp(-(t % beat) * 9) * 0.03 : 0;
      const scale = 2.2 - 1.2 * slam + pulse;
      const shake = (height / 54) * Math.exp(-t * 9);
      ctx.save();
      ctx.translate(
        width / 2 + wobble(t, 1) * shake,
        height / 2 + wobble(t, 2) * shake,
      );
      ctx.scale(scale * (1 + snap * 0.6), scale * (1 - snap));
      ctx.globalAlpha = clamp(slam * 1.5);
      ctx.font = face(fitted);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = fitted * 0.05;
      const off = fitted * 0.055;
      lines.forEach((line, i) => {
        const y = (i - (lines.length - 1) / 2) * leading;
        // An offset block in the accent, then the word, stroked for weight.
        ctx.fillStyle = ctx.strokeStyle = accent;
        ctx.strokeText(line, off, y + off);
        ctx.fillText(line, off, y + off);
        ctx.fillStyle = ctx.strokeStyle = color;
        ctx.strokeText(line, 0, y);
        ctx.fillText(line, 0, y);
      });
      ctx.restore();
    },
    dispose() {},
  };
}
