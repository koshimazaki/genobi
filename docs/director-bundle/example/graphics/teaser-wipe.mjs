// A Signal wipe across a cut: a matte sweeps over the picture behind a lime
// edge and a band of halftone dots, holds for an instant on the cut, then
// sweeps off the far side to reveal the next shot. Put the layer so its
// middle is on the cut; `seconds` is its whole length. Pure in time: the
// edge and every dot are functions of the layer's time and a seed.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const inOut = (x) => {
  const k = clamp(x, 0, 1);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};
const hash = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

export function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const p = parameters;
  const across = p.direction === "left" || p.direction === "right";
  const length = across ? width : height;
  const breadth = across ? height : width;
  const flip = p.direction === "left" || p.direction === "up";
  const u = width / 1280;
  const cell = 9 * u;
  const band = 120 * u;
  // A rectangle in the wipe's own axis: a along the travel, b across it.
  const rect = (a0, a1, b0, b1) => {
    const [s, e] = flip ? [length - a1, length - a0] : [a0, a1];
    if (across) ctx.fillRect(s, b0, e - s, b1 - b0);
    else ctx.fillRect(b0, s, b1 - b0, e - s);
  };
  const dot = (a, b, r) => {
    const s = flip ? length - a : a;
    ctx.beginPath();
    if (across) ctx.arc(s, b, r, 0, Math.PI * 2);
    else ctx.arc(b, s, r, 0, Math.PI * 2);
    ctx.fill();
  };
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = clamp(timeSeconds / p.seconds, 0, 1);
      ctx.clearRect(0, 0, width, height);
      // 0–0.45 covers, 0.45–0.55 holds, 0.55–1 uncovers.
      const cover = inOut(t / 0.45);
      const uncover = inOut((t - 0.55) / 0.45);
      const lead = cover * (length + band);
      const tail = uncover * (length + band);
      if (tail >= length + band) return;
      ctx.fillStyle = p.color;
      rect(tail, Math.min(length, lead - band), 0, breadth);
      // The halftone band ahead of the matte while covering, behind it after.
      const edge = uncover > 0 ? tail : lead - band;
      const dir = uncover > 0 ? -1 : 1;
      ctx.fillStyle = p.color;
      const rows = Math.ceil(breadth / cell);
      for (let i = 0; i < band / cell; i++)
        for (let j = 0; j < rows; j++) {
          const a = edge + dir * (i + 0.5) * cell;
          if (a < 0 || a > length) continue;
          const fall = 1 - i / (band / cell);
          const r =
            (cell / 2) * fall * (0.55 + 0.45 * hash(i * 31 + j * 7 + p.seed));
          if (r > 0.4) dot(a, (j + 0.5) * cell, r);
        }
      // The lime edge.
      const at = uncover > 0 ? tail : lead - band;
      if (at > 0 && at < length) {
        ctx.fillStyle = p.accent;
        rect(at - 2 * u, at + 2 * u, 0, breadth);
      }
    },
    dispose() {},
  };
}
