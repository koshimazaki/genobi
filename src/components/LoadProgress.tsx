import spinners from "cli-spinners";
import { useActivity, type Activity } from "../busy";
import {
  isMediaActivity,
  parseActivityLine,
  useMediaLoad,
} from "../director/media-progress";
import { loadSoundActive, useLoadSound } from "../load-sound/useLoadSound";
import { useSpinnerFrame } from "../spinner";
import "./load-progress.css";

/**
 * What the header bar shows: the newest template media load, else the newest
 * activity whose line carries a real percent (background play only when
 * nothing real is listed). A media load without a known
 * total is indeterminate; any other line without a percent shows nothing,
 * because the bar never stands in for progress nobody reported.
 */
export function headerProgress(
  activity: Activity[],
): { label: string; percent?: number } | undefined {
  const media = activity.filter((a) => isMediaActivity(a.id)).at(-1);
  if (media) return parseActivityLine(media.line);
  // Play (the walkers game) shows only when no real work is listed, so a job
  // without a reported percent is never covered by a game's bar.
  const real = activity.filter((a) => !a.background);
  for (const a of [...(real.length ? real : activity)].reverse()) {
    const parsed = parseActivityLine(a.line);
    if (parsed.percent !== undefined) return parsed;
  }
  return undefined;
}

// The cells come from the package's own `aesthetic` frames, so nothing of
// cli-spinners is copied into the repo: its first frame is one full cell then
// empty ones (`▰▱▱▱▱▱▱`).
const AESTHETIC = spinners.aesthetic.frames;
const FULL = AESTHETIC[0][0];
const EMPTY = AESTHETIC[0].at(-1)!;
const CELLS = [...AESTHETIC[0]].length;

/** Splits a bar into its filled and empty runs, for the two colours. */
function cells(bar: string) {
  const glyphs = [...bar];
  const filled = glyphs.filter((g) => g === FULL).length;
  return { filled: FULL.repeat(filled), empty: EMPTY.repeat(CELLS - filled) };
}

/** The `aesthetic` bar filled to `percent`: round(percent / 100 × 7) cells. */
export function percentCells(percent: number) {
  const filled = Math.round(
    (Math.min(100, Math.max(0, percent)) / 100) * CELLS,
  );
  return FULL.repeat(filled) + EMPTY.repeat(CELLS - filled);
}

/**
 * A glyph loader beside the wordmark while a load or job reports progress,
 * drawn from cli-spinners (Sindre Sorhus, MIT), whose catalogue entry says
 * "aesthetic and binary are useful starting points for loaders and video
 * overlays". With a known total it is `[binary] ▰▰▰▱▱▱▱ 36%`: the `aesthetic`
 * cells as a real bar, not animated by time, and a `binary` frame cycling so
 * the load reads as alive. Without a total, the `aesthetic` spinner runs as
 * the package defines it, with no percent. Frames hold still under reduced
 * motion (`useSpinnerFrame`). Text in the header's mono, so it never moves the
 * header or pushes the navigation. A load that lasts also sounds a short
 * synthesised cue at its start and end (`src/load-sound/`).
 */
export default function LoadProgress() {
  const activity = useActivity();
  const shown = headerProgress(activity);
  // A quiet cue for a load that lasts, in case the bar is missed.
  useLoadSound(loadSoundActive(activity));
  const load = useMediaLoad();
  const known = shown?.percent !== undefined;
  const binary = useSpinnerFrame("binary", !!shown && known);
  const aesthetic = useSpinnerFrame("aesthetic", !!shown && !known);
  if (!shown) return null;
  const label = load ? `Loading ${load.name}` : shown.label;
  const bar = cells(known ? percentCells(shown.percent!) : aesthetic);
  return (
    <span
      className="brand-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? shown.percent : undefined}
      title={label}
    >
      {known && (
        <span className="brand-progress-binary" aria-hidden="true">
          {binary}
        </span>
      )}
      <span className="brand-progress-bar" aria-hidden="true">
        <span className="brand-progress-filled">{bar.filled}</span>
        <span className="brand-progress-empty">{bar.empty}</span>
      </span>
      {known && <span className="brand-progress-label">{shown.percent}%</span>}
    </span>
  );
}
