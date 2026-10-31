/** Validated sRGB hex colors, mixed on the same deterministic state clock. */
export function blendSceneColors(colors: { color: string; weight: number }[]) {
  const channels = [1, 3, 5].map((offset) =>
    Math.round(
      colors.reduce(
        (sum, { color, weight }) =>
          sum + Number.parseInt(color.slice(offset, offset + 2), 16) * weight,
        0,
      ),
    ),
  );
  return `#${channels.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

export function mixSceneColor(a: string, b: string, progress: number) {
  if (progress <= 0) return a;
  if (progress >= 1) return b;
  return blendSceneColors([
    { color: a, weight: 1 - progress },
    { color: b, weight: progress },
  ]);
}
