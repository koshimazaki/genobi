/**
 * The curve picker, redrawn from Holodeck's `components/ui/CameraCurvePicker.tsx`
 * (MIT, Glitch Candies Studio): the same six eases, labels, icons and
 * preview curve. The drop-down became a row of buttons so every curve is
 * one tap away and readable without opening anything.
 */
import {
  applyCameraEase,
  CAMERA_EASE_PRESETS,
  type CameraEaseKey,
} from "../../shared/camera-ease";

export function curvePath(
  ease: CameraEaseKey,
  width: number,
  height: number,
  pad: number,
): string {
  const points: string[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = pad + t * (width - pad * 2);
    const y = height - pad - applyCameraEase(ease, t) * (height - pad * 2);
    points.push(`${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return points.join("");
}

function CurveIcon({ ease }: { ease: CameraEaseKey }) {
  return (
    <svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true">
      <path d="M2 13H28" className="s3d-curve-axis" />
      <path d={curvePath(ease, 30, 16, 3)} className="s3d-curve-line" />
    </svg>
  );
}

export function CurvePicker({
  value,
  onChange,
}: {
  value: CameraEaseKey;
  onChange: (ease: CameraEaseKey) => void;
}) {
  const current = CAMERA_EASE_PRESETS.find((p) => p.key === value);
  return (
    <fieldset className="s3d-curves">
      <legend>
        Curve <span>{current?.label}</span>
      </legend>
      <div className="s3d-curve-preview" aria-hidden="true">
        <svg viewBox="0 0 120 48" preserveAspectRatio="none">
          <path d="M8 40H112M8 8V40" className="s3d-curve-axis" />
          <path d={curvePath(value, 120, 48, 8)} className="s3d-curve-line" />
        </svg>
      </div>
      <div className="s3d-curve-row">
        {CAMERA_EASE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            aria-pressed={preset.key === value}
            aria-label={`${preset.label} curve`}
            title={preset.label}
            onClick={() => onChange(preset.key)}
          >
            <CurveIcon ease={preset.key} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
