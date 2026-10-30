// A screen that opens from one line: a thin line draws across the middle of
// a matte, then splits into two edges that open to the full frame, with
// seeded mono glyph columns falling on the matte until it is gone. Every
// frame is a pure function of the layer's time, so a seek draws the same
// pixels as playback and export.
const GLYPHS = "01ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ<>/=+*";
const clamp = (x) => Math.min(1, Math.max(0, x));
const outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const outCubic = (x) => 1 - Math.pow(1 - x, 3);
// A small integer hash: the same seed and index always give the same value.
const hash = (seed, i) => {
  let h = (seed * 374761393 + i * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function createLayer({ canvas, width, height, parameters }) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const { color, matte, duration, glyphs, seed } = parameters;
  const glyphSize = Math.max(10, Math.round(height / 30));
  return {
    output: canvas,
    render({ timeSeconds }) {
      const t = Math.max(0, timeSeconds);
      ctx.clearRect(0, 0, width, height);
      // A quarter of the duration draws the line, the rest opens it.
      const draw = outCubic(clamp(t / (duration * 0.25)));
      const open = outExpo(clamp((t - duration * 0.25) / (duration * 0.75)));
      const fade = clamp(1 - (t - duration) / 0.25);
      if (fade <= 0) return;
      const half = Math.max(1, (open * height) / 2);
      const top = height / 2 - half,
        bottom = height / 2 + half;
      if (open < 1) {
        ctx.fillStyle = matte;
        ctx.fillRect(0, 0, width, top);
        ctx.fillRect(0, bottom, width, height - bottom);
        ctx.save();
        ctx.font = `400 ${glyphSize}px "IBM Plex Mono", monospace`;
        ctx.textBaseline = "top";
        ctx.fillStyle = color;
        for (let c = 0; c < glyphs; c++) {
          const x = hash(seed, c) * width;
          const speed = 0.6 + hash(seed, c + 97) * 1.4;
          const head = ((hash(seed, c + 31) + t * speed) % 1.2) * height;
          for (let k = 0; k < 8; k++) {
            const y = head - k * glyphSize * 1.1;
            if (y < 0 || (y > top && y < bottom)) continue;
            const ch =
              GLYPHS[
                Math.floor(
                  hash(seed + k, c + Math.floor(t * 12)) * GLYPHS.length,
                )
              ];
            ctx.globalAlpha = (1 - k / 8) * 0.55 * (1 - open);
            ctx.fillText(ch, x, y);
          }
        }
        ctx.restore();
      }
      // The line, then the two edges it becomes, glowing in the accent.
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = color;
      const lineWidth = width * draw;
      const x0 = (width - lineWidth) / 2;
      const thick = Math.max(2, Math.round(height / 220));
      ctx.fillRect(x0, top - thick / 2, lineWidth, thick);
      if (open > 0) ctx.fillRect(x0, bottom - thick / 2, lineWidth, thick);
      ctx.restore();
    },
    dispose() {},
  };
}
