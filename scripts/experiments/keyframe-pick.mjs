/** Pick the guide frames a look edit and a second image guide are anchored to. */

/** Centred moving average; the window shrinks at the ends instead of padding. */
export function smoothSeries(values, window = 5) {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const lo = Math.max(0, i - half),
      hi = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += values[k];
    return sum / (hi - lo + 1);
  });
}

/** LTX snaps image guides to its latent time grid of 8 frames. */
export const LATENT_STRIDE = 8;

/**
 * The nearest multiple of `stride` to `index`, never 0 and never the last
 * frame (a guide there would fight the first frame or end the take).
 */
export function snapToGrid(index, frames, stride = LATENT_STRIDE) {
  const highest = Math.floor((frames - 2) / stride) * stride;
  if (highest < stride)
    throw new Error(`A take of ${frames} frames has no interior grid frame.`);
  return Math.min(
    highest,
    Math.max(stride, Math.round(index / stride) * stride),
  );
}

/**
 * Frame 0, the "closed" frame (the loudest smoothed band: walls nearest) and
 * the "open" frame (the quietest smoothed band from `settle` onwards, so the
 * release follower's first rise is skipped). `source` is the raw 0-based
 * extreme; `index` is that frame snapped to the latent grid, the guide frame
 * actually used. Ties go to the earliest frame.
 */
export function pickKeyframes(
  series,
  { window = 5, settle = 8, stride = LATENT_STRIDE } = {},
) {
  if (!Array.isArray(series) || series.length <= settle)
    throw new Error(`A band series longer than ${settle} frames is required.`);
  const smooth = smoothSeries(series, window);
  let closed = 0,
    open = settle;
  for (let i = 0; i < smooth.length; i++)
    if (smooth[i] > smooth[closed]) closed = i;
  for (let i = settle; i < smooth.length; i++)
    if (smooth[i] < smooth[open]) open = i;
  const value = (i) => Math.round(smooth[i] * 10000) / 10000;
  const at = (role, source) => {
    const index = snapToGrid(source, series.length, stride);
    return { role, index, source, smoothed: value(index) };
  };
  return [
    { role: "first", index: 0, source: 0, smoothed: value(0) },
    at("closed", closed),
    at("open", open),
  ];
}

export function keyframeFile(role, index) {
  const n = String(index).padStart(4, "0");
  return role === "first" ? `frame-${n}.png` : `frame-${role}-${n}.png`;
}
