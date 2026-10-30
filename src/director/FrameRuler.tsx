import { subLabel, type TimeUnits } from "./timecode";

/** Instrument-style scale: frame ticks, five-frame accents and second labels. */
export default function FrameRuler({
  fps,
  durationFrames,
  zoom,
  units,
}: {
  fps: number;
  durationFrames: number;
  zoom: number;
  units: TimeUnits;
}) {
  const pixelsPerFrame = zoom / fps;
  // At dense zoom levels, retain a readable grid rather than overlapping lines.
  const step = Math.max(1, Math.ceil(2 / pixelsPerFrame));
  const labelStep = pixelsPerFrame * 5 >= 28 ? 5 : 10;
  return (
    <>
      <div className="dir-frame-scale" aria-hidden="true">
        {Array.from({ length: Math.ceil(durationFrames / step) }, (_, i) => {
          const frame = i * step;
          if (frame % fps === 0) return null;
          return (
            <i
              key={frame}
              className={(frame % fps) % 5 === 0 ? "major" : ""}
              style={{ left: frame * pixelsPerFrame }}
            />
          );
        })}
        {Array.from(
          { length: Math.ceil(durationFrames / fps) },
          (_, seconds) => (
            <i
              key={`s-${seconds}`}
              className="second"
              style={{ left: seconds * zoom }}
            />
          ),
        )}
      </div>
      {Array.from({ length: Math.ceil(durationFrames / fps) }, (_, seconds) => (
        <span
          className="dir-time-label"
          key={seconds}
          style={{ left: seconds * zoom }}
        >
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:
          {String(seconds % 60).padStart(2, "0")}
        </span>
      ))}
      {Array.from({ length: durationFrames }, (_, f) => f)
        .filter(
          (f) =>
            f % fps !== 0 &&
            (f % fps) % labelStep === 0 &&
            pixelsPerFrame * labelStep >= 24,
        )
        .map((f) => (
          <small
            className="dir-frame-label"
            key={f}
            style={{ left: f * pixelsPerFrame }}
          >
            {subLabel(f, fps, units)}
          </small>
        ))}
    </>
  );
}
