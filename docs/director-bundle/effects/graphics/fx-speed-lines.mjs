// Speed lines: tapered streaks travelling in `direction`, or manga focus
// lines closing on the centre ("radial"). Each line's place, length and pace
// come from the seed, and its position is a pure function of the layer's
// time, so a seek never depends on the frames drawn before it.
const hash = (seed, n) => {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(n, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
const frac = (x) => x - Math.floor(x);

export function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const { density, color, direction, speed, thickness, length, seed } =
    parameters;
  const lines = Array.from({ length: density }, (_, i) => ({
    lane: hash(seed, i * 4),
    phase: hash(seed, i * 4 + 1),
    size: 0.5 + 0.5 * hash(seed, i * 4 + 2),
    pace: 0.6 + 0.8 * hash(seed, i * 4 + 3),
  }));
  // A streak from a full-width head to a pointed tail.
  const streak = (hx, hy, tx, ty, w) => {
    const dx = tx - hx,
      dy = ty - hy,
      d = Math.hypot(dx, dy) || 1;
    const nx = ((-dy / d) * w) / 2,
      ny = ((dx / d) * w) / 2;
    ctx.beginPath();
    ctx.moveTo(hx + nx, hy + ny);
    ctx.lineTo(tx, ty);
    ctx.lineTo(hx - nx, hy - ny);
    ctx.closePath();
    ctx.fill();
  };
  // How far a ray from the centre at this angle runs before it leaves the
  // frame, so each focus line starts on the edge whatever the aspect.
  const edge = (cos, sin) =>
    Math.min(
      Math.abs(cos) > 1e-9 ? width / 2 / Math.abs(cos) : Infinity,
      Math.abs(sin) > 1e-9 ? height / 2 / Math.abs(sin) : Infinity,
    );
  const radial = (t) => {
    const cx = width / 2,
      cy = height / 2;
    // Focus lines redraw in steps, twelve a second at speed 1, like cels.
    const step = Math.floor(t * speed * 12);
    lines.forEach((l, i) => {
      const flicker = hash(seed * 7919 + step, i);
      const angle = 2 * Math.PI * (l.lane + ((flicker - 0.5) * 0.5) / density);
      const cos = Math.cos(angle),
        sin = Math.sin(angle);
      const outer = edge(cos, sin);
      const inner = outer * (1 - length * l.size * (0.75 + 0.25 * flicker));
      streak(
        cx + cos * outer,
        cy + sin * outer,
        cx + cos * inner,
        cy + sin * inner,
        thickness * l.size * 2,
      );
    });
  };
  const across = direction === "left" || direction === "right";
  const span = across ? width : height,
    breadth = across ? height : width;
  const back = direction === "left" || direction === "up";
  const along = (x) => (back ? span - x : x);
  const linear = (t) => {
    for (const l of lines) {
      const size = length * span * l.size;
      // A head enters at one edge and its tail leaves at the other.
      const head = frac(l.phase + t * speed * l.pace) * (span + size);
      const cross = l.lane * breadth,
        w = thickness * l.size;
      if (across) streak(along(head), cross, along(head - size), cross, w);
      else streak(cross, along(head), cross, along(head - size), w);
    }
  };
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      if (direction === "radial") radial(t);
      else linear(t);
    },
    dispose() {},
  };
}
