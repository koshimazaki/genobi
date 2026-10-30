// A transition to or from a matte colour. "in" opens on the matte and reveals
// the picture below it; "out" covers the picture and holds the matte to the
// layer's end. Coverage is a pure function of the layer's time, eased with
// Anime.js, so preview and exact-frame export agree.
const clamp = (x) => Math.min(1, Math.max(0, x));

export function createLayer({ canvas, width, height, parameters, libraries }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const ease = libraries.animejs.eases.inOutCubic;
  const { type, phase, duration, direction, color, slices } = parameters;
  const across = direction === "left" || direction === "right";
  const length = across ? width : height,
    breadth = across ? height : width;
  const forward = direction === "right" || direction === "down";
  // An "out" matte follows the edge in from behind it; an "in" matte leaves
  // ahead of the edge, so both read as the edge travelling in `direction`.
  const fromStart = (phase === "out") === forward;
  const bands = type === "slice" ? slices : 1;
  // Slices set off one after another across the first half of the duration.
  const stagger = bands > 1 ? 0.5 : 0;
  const fill = (from, to, b0, b1) =>
    across
      ? ctx.fillRect(from, b0, to - from, b1 - b0)
      : ctx.fillRect(b0, from, b1 - b0, to - from);
  return {
    output: canvas,
    render({ timeSeconds }) {
      const raw = clamp(timeSeconds / duration);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      if (type === "cut") {
        // The matte holds for the duration (in) or arrives after it (out).
        if (phase === "in" ? raw < 1 : raw >= 1)
          ctx.fillRect(0, 0, width, height);
        return;
      }
      if (type === "crossfade") {
        const p = ease(raw);
        ctx.globalAlpha = phase === "in" ? 1 - p : p;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
        return;
      }
      for (let i = 0; i < bands; i++) {
        const start = bands > 1 ? (stagger * i) / (bands - 1) : 0;
        const p = ease(clamp((raw - start) / (1 - stagger)));
        const cover = (phase === "in" ? 1 - p : p) * length;
        if (cover <= 0) continue;
        const from = fromStart ? 0 : length - cover;
        fill(
          from,
          from + cover,
          Math.floor((i * breadth) / bands),
          Math.floor(((i + 1) * breadth) / bands),
        );
      }
    },
    dispose() {},
  };
}
