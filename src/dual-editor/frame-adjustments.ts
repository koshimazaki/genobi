import { curveLut, identityCurves, type Curves } from "./color-curves";
export type AdjustmentKey =
  "exposure" | "brightness" | "contrast" | "saturation" | "hue";
export interface Adjustments {
  curves: Curves;
  exposure: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
}
export const neutral: Adjustments = {
  curves: identityCurves,
  exposure: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
};
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const linear = (x: number) =>
  x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
const srgb = (x: number) =>
  x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
/** Real pixel processing shared by preview, histogram and PNG export. */
export function adjustPixels(data: Uint8ClampedArray, settings: Adjustments) {
  if (JSON.stringify(settings) === JSON.stringify(neutral)) return;
  const curves = settings.curves ?? identityCurves;
  const master = curveLut(curves.rgb),
    red = curveLut(curves.red),
    green = curveLut(curves.green),
    blue = curveLut(curves.blue);
  const exposure = 2 ** settings.exposure,
    contrast = 1 + settings.contrast / 100,
    saturation = 1 + settings.saturation / 100;
  for (let i = 0; i < data.length; i += 4) {
    let r = clamp(
      (srgb(linear(data[i] / 255) * exposure) - 0.5) * contrast +
        0.5 +
        settings.brightness / 100,
    );
    let g = clamp(
      (srgb(linear(data[i + 1] / 255) * exposure) - 0.5) * contrast +
        0.5 +
        settings.brightness / 100,
    );
    let b = clamp(
      (srgb(linear(data[i + 2] / 255) * exposure) - 0.5) * contrast +
        0.5 +
        settings.brightness / 100,
    );
    r = red[master[Math.round(r * 255)]] / 255;
    g = green[master[Math.round(g * 255)]] / 255;
    b = blue[master[Math.round(b * 255)]] / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    let h =
      d === 0
        ? 0
        : max === r
          ? ((g - b) / d + 6) % 6
          : max === g
            ? (b - r) / d + 2
            : (r - g) / d + 4;
    h = (h + settings.hue / 60 + 6) % 6;
    const sat = clamp((max ? d / max : 0) * saturation),
      c = max * sat,
      x = c * (1 - Math.abs((h % 2) - 1)),
      m = max - c;
    [r, g, b] =
      h < 1
        ? [c, x, 0]
        : h < 2
          ? [x, c, 0]
          : h < 3
            ? [0, c, x]
            : h < 4
              ? [0, x, c]
              : h < 5
                ? [x, 0, c]
                : [c, 0, x];
    data[i] = (r + m) * 255;
    data[i + 1] = (g + m) * 255;
    data[i + 2] = (b + m) * 255;
  }
}
export function adjustedFrame(
  original: HTMLCanvasElement,
  settings: Adjustments,
  mask?: HTMLCanvasElement,
  background?: HTMLCanvasElement | null,
) {
  const canvas = document.createElement("canvas");
  canvas.width = original.width;
  canvas.height = original.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(original, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  adjustPixels(pixels.data, settings);
  ctx.putImageData(pixels, 0, 0);
  if (mask) {
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);
    if (background) {
      ctx.globalCompositeOperation = "destination-over";
      const scale = Math.max(
        canvas.width / background.width,
        canvas.height / background.height,
      );
      ctx.drawImage(
        background,
        (canvas.width - background.width * scale) / 2,
        (canvas.height - background.height * scale) / 2,
        background.width * scale,
        background.height * scale,
      );
    }
    ctx.globalCompositeOperation = "source-over";
  }
  return canvas;
}
