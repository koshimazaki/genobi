// A styled title card: a slanted plate slides in, then the words slide
// through its window a beat behind it, both on an Anime.js easing curve.
// Positions are a pure function of the layer's time, so a seek never depends
// on the frames drawn before it.
const FONTS = {
  "Instrument Sans": (size) =>
    `600 ${size}px "Instrument Sans Variable", sans-serif`,
  "IBM Plex Mono": (size) => `400 ${size}px "IBM Plex Mono", monospace`,
};
// Anime.js builds these curves from a factory; the rest are curves already.
const FACTORIES = new Set(["outBack", "outElastic"]);
const SLANT = 0.18;
const clamp = (x) => Math.min(1, Math.max(0, x));

export async function createLayer({
  canvas,
  width,
  height,
  parameters,
  libraries,
}) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const { text, font, color, accent, plate, size, direction, ease, duration } =
    parameters;
  const face = FONTS[font](size);
  // Measure and draw only once the face has loaded, in preview and export.
  await globalThis.document?.fonts?.load(face, text || " ");
  const named = libraries.animejs.eases[ease];
  const curve = FACTORIES.has(ease) ? named() : named;
  ctx.font = face;
  const plateWidth = ctx.measureText(text).width + size * 1.2,
    plateHeight = size * 1.5;
  const across = direction === "left" || direction === "right";
  const sign = direction === "right" || direction === "down" ? 1 : -1;
  // The plate starts wholly outside the frame, behind where it rests.
  const travel = across
    ? width / 2 + plateWidth
    : height / 2 + plateHeight / 2 + size;
  const shift = (amount) =>
    across ? [-sign * amount, 0] : [0, -sign * amount];
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      const bar = curve(clamp(t / (duration * 0.6)));
      const word = curve(clamp((t - duration * 0.3) / (duration * 0.7)));
      const [px, py] = shift((1 - bar) * travel);
      const [wx, wy] = shift((1 - word) * (across ? plateWidth : plateHeight));
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2 + px, height / 2 + py);
      ctx.transform(1, 0, -SLANT, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(-plateWidth / 2, -plateHeight / 2, plateWidth, plateHeight);
      if (plate) {
        ctx.fillStyle = accent;
        ctx.fill();
      }
      ctx.clip();
      ctx.transform(1, 0, SLANT, 1, 0, 0);
      ctx.font = face;
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, wx, wy);
      ctx.restore();
    },
    dispose() {},
  };
}
