// Adapted from an earlier Koshi interface experiment.
// See the adjacent MIT licence for attribution and reuse terms.
// Keep the existing field's light as its reveal order, so arrival does not
// replace the waiting pattern. Cells are painted directly; no pixel readback.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function drawDitherField(
  ctx: CanvasRenderingContext2D,
  time: number,
  reveal = 0,
) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (reveal >= 1) return;
  ctx.fillStyle = `rgba(21,23,24,${1 - smooth(reveal / 0.35)})`;
  ctx.fillRect(0, 0, width, height);
  const cell = Math.max(4, Math.min(width, height) / 34);
  const gap = Math.max(0.5, cell * 0.13);
  const xCenter = 0.5 + Math.sin(time * 0.085) * 0.65;
  const yCenter = 0.5 + Math.sin(time * 0.065 + 1.8) * 0.65;
  const mix = (Math.sin(time * 0.11) + 1) / 2;
  for (let row = 0, y = 0; y < height; row++, y += cell) {
    for (let col = 0, x = 0; x < width; col++, x += cell) {
      const xBand = Math.max(0, 1 - Math.abs(x / width - xCenter) / 0.78);
      const yBand = Math.max(0, 1 - Math.abs(y / height - yCenter) / 0.78);
      const light = Math.pow(xBand * mix + yBand * (1 - mix), 1.6);
      const grain = BAYER[(row % 4) * 4 + (col % 4)] / 16;
      const tone = Math.round(26 + light * 76 + grain * 7);
      const alpha =
        1 - smooth((reveal - (light * 0.8 + grain * 0.2) * 0.65) / 0.35);
      ctx.fillStyle = `rgba(${tone},${tone + 2},${tone + 3},${alpha})`;
      ctx.fillRect(x, y, cell - gap, cell - gap);
    }
  }
}
