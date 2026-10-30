import { beatLines, type BeatGrid } from "../../shared/director/beat-grid";

export default function TimelineGrid({
  gutter,
  durationFrames,
  fps,
  pixels,
  grid,
}: {
  gutter: number;
  durationFrames: number;
  fps: number;
  pixels: number;
  grid: BeatGrid;
}) {
  const paths = { minor: "", major: "", second: "", beat: "", bar: "" };
  const step = Math.max(1, Math.ceil(2 / pixels));
  for (let f = 0; f <= durationFrames; f++) {
    const kind =
      f % fps === 0 ? "second" : (f % fps) % 5 === 0 ? "major" : "minor";
    if (kind !== "minor" || f % step === 0)
      paths[kind] += `M${f * pixels + 0.5},0V1`;
  }
  // Beats start at the composition's beat offset; a downbeat draws a bar line.
  for (const { frame, bar } of beatLines(durationFrames, grid))
    paths[bar ? "bar" : "beat"] += `M${frame * pixels + 0.5},0V1`;
  return (
    <svg
      className="dir-timeline-grid"
      style={{
        width: durationFrames * pixels,
        left: `var(--dir-gutter, ${gutter}px)`,
      }}
      viewBox={`0 0 ${durationFrames * pixels} 1`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {Object.entries(paths).map(([kind, d]) => (
        <path key={kind} className={kind} d={d} />
      ))}
    </svg>
  );
}
