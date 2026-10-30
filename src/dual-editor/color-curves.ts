export type CurveChannel = "rgb" | "red" | "green" | "blue";
export type Curve = [number, number, number];
export type Curves = Record<CurveChannel, Curve>;
export const identityCurves: Curves = {
  rgb: [64, 128, 192],
  red: [64, 128, 192],
  green: [64, 128, 192],
  blue: [64, 128, 192],
};
/** Five fixed input anchors with editable shadows, midtones and highlights. */
export function curveLut(curve: Curve) {
  const inputs = [0, 64, 128, 192, 255],
    outputs = [0, ...curve, 255];
  return Uint8ClampedArray.from({ length: 256 }, (_, x) => {
    const i = Math.min(3, Math.floor(x / 64));
    return (
      outputs[i] +
      ((outputs[i + 1] - outputs[i]) * (x - inputs[i])) /
        (inputs[i + 1] - inputs[i])
    );
  });
}
export const gradingPresets: Record<
  string,
  { curves: Curves; saturation: number }
> = {
  Neutral: { curves: identityCurves, saturation: 0 },
  Punch: { curves: { ...identityCurves, rgb: [50, 128, 208] }, saturation: 12 },
  Warm: {
    curves: { ...identityCurves, red: [70, 137, 199], blue: [58, 121, 185] },
    saturation: 4,
  },
  Cool: {
    curves: { ...identityCurves, red: [60, 121, 187], blue: [70, 136, 199] },
    saturation: 0,
  },
};
