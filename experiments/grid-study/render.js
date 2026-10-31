/* global document, Image, URL */
export const FPS = 24,
  FRAMES = 96,
  WIDTH = 960,
  HEIGHT = 540;
const SW = 480,
  SH = 270,
  COLS = 8,
  OFFSET = 16;
export const SOURCE = {
  asset: "bloom-h3-b",
  url: "/media/director-templates/bloom-teaser/bloom-h3-b.mp4",
  sha256: "5276e31e954a068d60a9b8a66fe3a5d4b0568cefdc1009a880a93243816b1114",
  primaryOffsetFrames: OFFSET,
  bankFrames: 128,
  bankWidth: SW,
  bankHeight: SH,
};
export const WINDOW = { x: 259, y: 127, width: 442, height: 286 };
export function cellDelay(col, row, amount) {
  const dx = Math.max(8 - col, col - 11, 0);
  const dy = Math.max(4 - row, row - 7, 0);
  return Math.min(4, Math.max(dx, dy) * 0.65) * amount;
}
export async function createRenderer(canvas) {
  const ctx = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });
  const atlas = new Image();
  atlas.src = new URL("./media/bloom-atlas.jpg", import.meta.url).href;
  await atlas.decode();
  if (atlas.naturalWidth !== SW * COLS || atlas.naturalHeight !== SH * 16)
    throw Error("The source atlas dimensions do not match the study.");
  const scratch = document.createElement("canvas");
  scratch.width = SW;
  scratch.height = SH;
  const sc = scratch.getContext("2d", { willReadFrequently: true });
  const water = document.createElement("canvas");
  water.width = SW;
  water.height = SH;
  const wc = water.getContext("2d");
  const waterPixels = wc.createImageData(SW, SH);
  const panel = document.createElement("canvas");
  panel.width = WINDOW.width;
  panel.height = WINDOW.height;
  const panelContext = panel.getContext("2d");
  const cache = new Map();
  function source(frame, target = ctx, width = WIDTH, height = HEIGHT) {
    target.drawImage(
      atlas,
      (frame % COLS) * SW,
      Math.floor(frame / COLS) * SH,
      SW,
      SH,
      0,
      0,
      width,
      height,
    );
  }
  function pixels(frame) {
    if (!cache.has(frame)) {
      source(frame, sc, SW, SH);
      cache.set(frame, sc.getImageData(0, 0, SW, SH).data);
      if (cache.size > 8) cache.delete(cache.keys().next().value);
    }
    return cache.get(frame);
  }
  function lines(cols, rows, box, alpha) {
    ctx.save();
    ctx.strokeStyle = `rgba(231,233,229,${alpha})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) {
      const x = box.x + (box.width * i) / cols;
      ctx.moveTo(x, box.y);
      ctx.lineTo(x, box.y + box.height);
    }
    for (let i = 0; i <= rows; i++) {
      const y = box.y + (box.height * i) / rows;
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.width, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  function poster(frame, amount) {
    const { x, y, width, height } = WINDOW;
    const original = ctx.getImageData(x, y, width, height);
    const p = original.data;
    for (let yy = 0; yy < height; yy++)
      for (let xx = 0; xx < width; xx++) {
        const i = (yy * width + xx) * 4;
        const r = p[i],
          g = p[i + 1],
          b = p[i + 2];
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const level =
          Math.round(Math.max(0, Math.min(1, (luminance - 0.04) / 0.87)) * 4) /
          4;
        const dx = ((xx + x) % 6) - 2.5,
          dy = ((yy + y) % 6) - 2.5;
        const radius = Math.sqrt(1 - level) * 2.05;
        const shade =
          level < 0.12
            ? 20
            : level > 0.88
              ? 237
              : dx * dx + dy * dy < radius * radius
                ? 30
                : 224;
        let color = [shade, shade, shade - 4];
        // Small accents follow actual source chroma in narrow regions, not random pixels.
        if (xx < width * 0.3 && r > g * 1.4 && r > b * 0.8 && luminance > 0.23)
          color = [173, 65, 69];
        else if (
          xx > width * 0.88 &&
          g > r * 1.35 &&
          b > r * 1.25 &&
          luminance > 0.3
        )
          color = [70, 151, 155];
        const mix = 1 - (1 - amount) ** 3;
        p[i] = r + (color[0] - r) * mix;
        p[i + 1] = g + (color[1] - g) * mix;
        p[i + 2] = b + (color[2] - b) * mix;
      }
    // One shared displacement for the complete window; cells never repeat the image.
    panelContext.putImageData(original, 0, 0);
    const t = frame / FPS;
    const jitterX = 1.2 * amount * Math.sin(t * 2.1);
    const jitterY = 0.8 * amount * Math.sin(t * 1.6 + 0.4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.drawImage(panel, x + jitterX, y + jitterY);
    ctx.restore();
    lines(3, 3, WINDOW, 0.72 * amount);
  }
  function bilinear(data, x, y, channel) {
    const x0 = Math.floor(x),
      y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, SW - 1),
      y1 = Math.min(y0 + 1, SH - 1);
    const ax = x - x0,
      ay = y - y0;
    const a =
      data[(y0 * SW + x0) * 4 + channel] * (1 - ax) +
      data[(y0 * SW + x1) * 4 + channel] * ax;
    const b =
      data[(y1 * SW + x0) * 4 + channel] * (1 - ax) +
      data[(y1 * SW + x1) * 4 + channel] * ax;
    return a * (1 - ay) + b * ay;
  }
  function waterGrid(frame, amount, showGrid) {
    const table = [];
    for (let row = 0; row < 12; row++)
      for (let col = 0; col < 20; col++) {
        const delay = cellDelay(col, row, amount);
        const time = Math.max(0, Math.min(127, OFFSET + frame - delay));
        const lo = Math.floor(time),
          hi = Math.min(127, lo + 1);
        table.push({ a: pixels(lo), b: pixels(hi), mix: time - lo });
      }
    const output = waterPixels.data,
      phase = (frame / FPS) * 1.25;
    for (let y = 0; y < SH; y++)
      for (let x = 0; x < SW; x++) {
        const col = Math.min(19, Math.floor((x * 20) / SW)),
          row = Math.min(11, Math.floor((y * 12) / SH));
        const entry = table[row * 20 + col];
        const dx = Math.max(192 - x, x - 287, 0),
          dy = Math.max(90 - y, y - 179, 0);
        const distance = Math.min(1, Math.hypot(dx, dy) / 24);
        const edge = distance * distance * (3 - 2 * distance);
        // One continuous global field with an exactly zero central rectangle.
        const sx = Math.max(
          0,
          Math.min(
            SW - 1,
            x +
              0.7 *
                amount *
                edge *
                Math.sin(y * 0.047 + phase) *
                Math.sin(x * 0.021 + phase * 0.4),
          ),
        );
        const sy = Math.max(
          0,
          Math.min(
            SH - 1,
            y + 0.45 * amount * edge * Math.cos(x * 0.039 - phase * 0.7),
          ),
        );
        const index = (y * SW + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          const a = bilinear(entry.a, sx, sy, channel),
            b = bilinear(entry.b, sx, sy, channel);
          output[index + channel] = a + (b - a) * entry.mix;
        }
        output[index + 3] = 255;
      }
    wc.putImageData(waterPixels, 0, 0);
    ctx.drawImage(water, 0, 0, WIDTH, HEIGHT);
    // Restore the exact primary image through the center, including its edges:
    // upscaling must not blend delayed neighboring pixels into locked cells.
    ctx.save();
    ctx.beginPath();
    ctx.rect(384, 180, 192, 180);
    ctx.clip();
    source(OFFSET + frame);
    ctx.restore();
    if (showGrid) {
      lines(
        20,
        12,
        { x: 0, y: 0, width: WIDTH, height: HEIGHT },
        0.19 * amount,
      );
      ctx.strokeStyle = `rgba(225,231,228,${0.5 * amount})`;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(384, 180, 192, 180);
    }
  }
  return {
    draw(frame, { mode, intensity, grid }) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      source(OFFSET + frame);
      if (intensity > 0) {
        if (mode === "poster") poster(frame, intensity);
        else waterGrid(frame, intensity, grid);
      }
    },
    source(frame) {
      source(OFFSET + frame);
    },
    diagnostics() {
      return {
        atlasDecodes: 1,
        bankFrames: 128,
        cachedPixelFrames: cache.size,
        maxDelayFrames: 4,
      };
    },
  };
}
