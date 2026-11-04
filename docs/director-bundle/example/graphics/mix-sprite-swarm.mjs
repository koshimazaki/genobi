// A swarm of pixel-art fruit around a point, like a game: the same apples,
// bananas and watermelon slices as `sprite-shower`, but gathered. Over
// `gather` seconds from the layer's start they fly in along their own rays
// from off frame into a disc of `radius` (a fraction of the frame's width)
// centred on (x, y); there they swirl at `swirl` radians a second and bob
// `bob` pixels on every beat at `bpm`; from `burst` seconds they fly out
// along the same rays. `count` sprites, `size` screen pixels per sprite
// pixel on a 1920-wide frame (the inner ones larger), placed by `seed`.
// Sprites are whole-pixel squares snapped to their grid, so they stay crisp.
// Its own recipe rather than a mode of `sprite-shower`, so that recipe, and
// every project pinned to its hash, stays as it is. Pure in time.
const SPRITES = [
  {
    pal: {
      r: "#e8343c",
      d: "#a51f2a",
      w: "#ff9e9e",
      g: "#3fa34d",
      b: "#6b4423",
    },
    rows: [
      ".....b.gg...",
      ".....bgg....",
      "..rrrbrrr...",
      ".rrrrrrrrr..",
      "rrwrrrrrrrr.",
      "rwrrrrrrrdr.",
      "rrrrrrrrrdr.",
      "rrrrrrrrrdr.",
      ".rrrrrrrddr.",
      ".rrrrrrrdd..",
      "..rrd.ddd...",
      "............",
    ],
  },
  {
    pal: { y: "#ffd84a", o: "#d9a521", k: "#4a3216" },
    rows: [
      "..........k.",
      ".........yy.",
      "........yyo.",
      ".......yyyo.",
      "......yyyo..",
      ".....yyyo...",
      "...yyyyoo...",
      ".yyyyyoo....",
      "kyyyooo.....",
      ".kooo.......",
      "............",
      "............",
    ],
  },
  {
    pal: { r: "#ff4d5e", k: "#1a1a1a", l: "#c9f2a0", g: "#2f8f3a" },
    rows: [
      "............",
      "............",
      "rrrrrrrrrrrr",
      "rrkrrrrkrrrr",
      "rrrrrkrrrrkr",
      ".rrkrrrrrrr.",
      ".rrrrrkrrrr.",
      "..rrrrrrrr..",
      "..llllllll..",
      "...gggggg...",
      "............",
      "............",
    ],
  },
];
const GRID = 12;
const frac = (v) => v - Math.floor(v);
const hash = (n) => frac(Math.sin(n * 127.1 + 311.7) * 43758.5453);

export function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const p = parameters;
  const k = width / 1920;
  const unit = Math.max(1, Math.round(p.size * k));
  const radius = p.radius * width;
  const cx = p.x * width,
    cy = p.y * height;
  // Far enough that every sprite starts off frame.
  const far = Math.hypot(width, height);
  const beat = 60 / p.bpm;
  const sprites = Array.from({ length: p.count }, (_, i) => {
    const h = (n) => hash(p.seed * 1013 + i * 97 + n * 7);
    const r = radius * Math.sqrt(h(1));
    return {
      kind: Math.floor(h(2) * SPRITES.length),
      r,
      angle: h(3) * Math.PI * 2,
      px: r < radius * 0.6 ? Math.round(unit * 1.2) : unit,
      phase: h(4) * Math.PI * 2,
    };
  });
  const draw = (sprite, x, y, px) => {
    const { pal, rows } = SPRITES[sprite];
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++) {
        const key = rows[r][c];
        if (key === ".") continue;
        ctx.fillStyle = pal[key];
        ctx.fillRect(x + c * px, y + r * px, px, px);
      }
  };
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      ctx.clearRect(0, 0, width, height);
      const g = p.gather > 0 ? Math.min(1, t / p.gather) : 1;
      const arrive = 1 - Math.pow(1 - g, 3);
      const out = Math.max(0, t - p.burst);
      for (const s of sprites) {
        const a = s.angle + t * p.swirl;
        // Into the disc from off frame, then out again after the burst.
        const d = s.r + far * (1 - arrive) + out * far * 2.5;
        const bob = Math.sin((t / beat) * Math.PI * 2 + s.phase) * p.bob * k;
        const x = cx + Math.cos(a) * d;
        const y = cy + Math.sin(a) * d + bob;
        const span = GRID * s.px;
        if (x < -span || x > width + span || y < -span || y > height + span)
          continue;
        draw(
          s.kind,
          Math.round((x - span / 2) / s.px) * s.px,
          Math.round((y - span / 2) / s.px) * s.px,
          s.px,
        );
      }
    },
    dispose() {},
  };
}
