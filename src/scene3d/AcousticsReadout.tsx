/**
 * The scene's room acoustics as text (`shared/scene/acoustics.ts`): decay per
 * band, critical distance, pre-delay and the nearest AKUSPACE preset. A
 * readout only: nothing here reaches audio.
 */
import { useMemo } from "react";
import { roomAcoustics } from "../../shared/scene/acoustics";
import type { SceneSpec } from "./scenes";

const band = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : String(hz));

export function AcousticsReadout({ scene }: { scene: SceneSpec }) {
  const a = useMemo(() => roomAcoustics(scene), [scene]);
  if (!a)
    return (
      <p className="s3d-acoustics-empty">
        No walls: an open set has no reverb to report. A scene with a room
        (walls, floor and ceiling) reads its acoustics here.
      </p>
    );
  const longest = Math.max(...a.bands.map((b) => b.rt60));
  return (
    <div className="s3d-acoustics">
      <ol className="s3d-acoustics-bands" aria-label="RT60 per octave band">
        {a.bands.map((b) => (
          <li key={b.hz} title={`${b.hz} Hz: ${b.rt60} s (${b.formula})`}>
            <span
              className="s3d-acoustics-bar"
              style={{ height: `${Math.max(4, (b.rt60 / longest) * 100)}%` }}
            />
            <small>{band(b.hz)}</small>
            <output>{b.rt60.toFixed(2)}</output>
          </li>
        ))}
      </ol>
      <dl>
        <dt>Volume</dt>
        <dd>{a.volumeM3} m³</dd>
        <dt>RT60 mid</dt>
        <dd>{a.rt60Mid} s</dd>
        <dt>Brightness</dt>
        <dd>{a.brightness}</dd>
        <dt>Critical distance</dt>
        <dd>{a.criticalDistanceM} m</dd>
        <dt>Pre-delay</dt>
        <dd>{a.preDelayMs} ms</dd>
        <dt>Formula</dt>
        <dd>{a.formula}</dd>
        <dt>Nearest preset</dt>
        <dd>
          {a.nearestPreset.label} ({a.nearestPreset.rt60} s, ±
          {a.nearestPreset.distanceS} s)
        </dd>
      </dl>
      <p className="s3d-acoustics-note">
        An estimate from the scene&apos;s geometry and materials. It does not
        change any audio yet.
      </p>
    </div>
  );
}
