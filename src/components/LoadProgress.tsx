import { useActivity, type Activity } from "../busy";
import {
  isMediaActivity,
  parseActivityLine,
  useMediaLoad,
} from "../director/media-progress";
import "./load-progress.css";

/**
 * What the header bar shows: the newest template media load, else the newest
 * activity whose line carries a real percent. A media load without a known
 * total is indeterminate; any other line without a percent shows nothing,
 * because the bar never stands in for progress nobody reported.
 */
export function headerProgress(
  activity: Activity[],
): { label: string; percent?: number } | undefined {
  const media = activity.filter((a) => isMediaActivity(a.id)).at(-1);
  if (media) return parseActivityLine(media.line);
  for (const a of [...activity].reverse()) {
    const parsed = parseActivityLine(a.line);
    if (parsed.percent !== undefined) return parsed;
  }
  return undefined;
}

/**
 * A slim bar beside the wordmark while a load or job reports its progress.
 * About 96 px wide and shorter than the name, so it never moves the header or
 * pushes the navigation.
 */
export default function LoadProgress() {
  const shown = headerProgress(useActivity());
  const load = useMediaLoad();
  if (!shown) return null;
  const label = load ? `Loading ${load.name}` : shown.label;
  const known = shown.percent !== undefined;
  return (
    <span
      className={`brand-progress${known ? "" : " brand-progress--sweep"}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? shown.percent : undefined}
      title={label}
    >
      <span className="brand-progress-track">
        <span
          className="brand-progress-fill"
          style={known ? { width: `${shown.percent}%` } : undefined}
        />
      </span>
      {known && <span className="brand-progress-label">{shown.percent}%</span>}
    </span>
  );
}
