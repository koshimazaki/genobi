// A shower of pixel-art fruit, like a game: apples, bananas and watermelon
// slices fly across the frame in `direction`, each at its own seeded pace and
// lane, bobbing as they go. The sprites are 12 x 12 pixel art drawn here
// (no image files), scaled by whole pixels so their edges stay crisp; `size`
// is the screen pixels per sprite pixel on a 1920-wide frame, and one sprite
// in four is drawn twice as large. `density` is how many fly at once and
// `speed` how many frame crossings a second the average one makes. Pure in
// time: positions are functions of the layer's time and `seed` alone.
// Original pixel art, in the Signal look.
const SPRITES = [
  {
    // Apple.
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
    // Banana.
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
    // Watermelon slice.
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
  const { density, speed, direction, size, seed } = parameters;
  const unit = Math.max(1, Math.round((size * width) / 1920));
  const across = direction === "left" || direction === "right";
  const length = across ? width : height;
  const breadth = across ? height : width;
  const flip = direction === "left" || direction === "up";
  const sprites = Array.from({ length: density }, (_, i) => {
    const h = (k) => hash(seed * 1013 + i * 97 + k * 7);
    return {
      kind: Math.floor(h(1) * SPRITES.length),
      px: unit * (h(2) < 0.25 ? 2 : 1),
      lane: h(3),
      phase: h(4),
      pace: 0.6 + 0.8 * h(5),
      bob: h(6) * Math.PI * 2,
    };
  });
  const draw = (sprite, x, y, px) => {
    const { pal, rows } = SPRITES[sprite];
    for (let r = 0; r < GRID; r++)
      for (let c = 0; c < GRID; c++) {
        const k = rows[r][c];
        if (k === ".") continue;
        ctx.fillStyle = pal[k];
        ctx.fillRect(x + c * px, y + r * px, px, px);
      }
  };
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      ctx.clearRect(0, 0, width, height);
      for (const s of sprites) {
        const span = GRID * s.px;
        // Along the travel: from just off one edge to just off the other.
        const p = frac(s.phase + t * speed * s.pace);
        let a = -span + p * (length + span);
        if (flip) a = length - a - span;
        const b =
          s.lane * (breadth - span) + Math.sin(t * 6 + s.bob) * s.px * 1.5;
        const [x, y] = across ? [a, b] : [b, a];
        // Snap to the sprite's pixel grid so every edge stays sharp.
        draw(
          s.kind,
          Math.round(x / s.px) * s.px,
          Math.round(y / s.px) * s.px,
          s.px,
        );
      }
    },
    dispose() {},
  };
}
