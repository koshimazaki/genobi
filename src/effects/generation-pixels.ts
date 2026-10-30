const pixels = [
  [10, 2],
  [16, 4],
  [18, 10],
  [16, 16],
  [10, 18],
  [4, 16],
  [2, 10],
  [4, 4],
];

/** Familiar spinner motion, drawn as eight crisp pixels. No progress estimate. */
export function drawGenerationPixels(
  ctx: CanvasRenderingContext2D,
  seconds: number,
  color: string,
) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width, height) / 20;
  const head = Math.floor(seconds / 0.12) % pixels.length;
  const size = Math.max(1, Math.round(3 * scale));
  ctx.fillStyle = color;
  pixels.forEach(([x, y], i) => {
    const age = (head - i + pixels.length) % pixels.length;
    ctx.globalAlpha = 1 - age * 0.11;
    ctx.fillRect(
      Math.round(x * scale - size / 2),
      Math.round(y * scale - size / 2),
      size,
      size,
    );
  });
  ctx.globalAlpha = 1;
}
