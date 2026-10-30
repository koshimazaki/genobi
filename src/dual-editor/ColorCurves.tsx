import { useState } from "react";
import {
  curveLut,
  gradingPresets,
  type Curve,
  type CurveChannel,
} from "./color-curves";
import type { FrameEdits } from "./useFrameEdits";

export default function ColorCurves({
  label,
  edit,
}: {
  label: string;
  edit: FrameEdits;
}) {
  const [channel, setChannel] = useState<CurveChannel>("rgb"),
    [point, setPoint] = useState(1);
  const curve = edit.settings.curves[channel],
    lut = curveLut(curve);
  function update(index: number, value: number) {
    const next: Curve = [...curve];
    next[index] = Math.round(Math.max(0, Math.min(255, value)));
    edit.setSettings({
      ...edit.settings,
      curves: { ...edit.settings.curves, [channel]: next },
    });
  }
  return (
    <details className="de-color-curves">
      <summary>Color grading & curves</summary>
      <div className="de-cut-actions">
        {Object.keys(gradingPresets).map((name) => (
          <button
            className="de-button"
            key={name}
            onClick={() =>
              edit.setSettings({
                ...edit.settings,
                ...structuredClone(gradingPresets[name]),
              })
            }
          >
            {name}
          </button>
        ))}
      </div>
      <div
        className="de-curve-channels"
        role="group"
        aria-label={`Frame ${label} curve channel`}
      >
        {(["rgb", "red", "green", "blue"] as const).map((c) => (
          <button
            key={c}
            className={`de-button de-curve-${c}`}
            aria-pressed={channel === c}
            onClick={() => setChannel(c)}
          >
            {c === "rgb" ? "RGB" : c}
          </button>
        ))}
      </div>
      <svg
        viewBox="0 0 255 255"
        className={`de-curve-graph de-curve-${channel}`}
        role="img"
        aria-label={`${channel} tonal curve`}
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect(),
            x = ((e.clientX - rect.left) / rect.width) * 255;
          const index = Math.max(0, Math.min(2, Math.round(x / 64) - 1));
          setPoint(index);
          e.currentTarget.setPointerCapture(e.pointerId);
          update(index, 255 - ((e.clientY - rect.top) / rect.height) * 255);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            const rect = e.currentTarget.getBoundingClientRect();
            update(point, 255 - ((e.clientY - rect.top) / rect.height) * 255);
          }
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
      >
        <path
          className="de-curve-grid"
          d="M0 64H255M0 128H255M0 192H255M64 0V255M128 0V255M192 0V255M0 255L255 0"
        />
        <path
          className="de-curve-line"
          d={[...lut]
            .map((v, x) => `${x ? "L" : "M"}${x} ${255 - v}`)
            .join(" ")}
        />
        {curve.map((v, i) => (
          <circle key={i} cx={(i + 1) * 64} cy={255 - v} r="5" />
        ))}
      </svg>
      {(["Shadows", "Midtones", "Highlights"] as const).map((name, i) => (
        <label className="de-adjustment" key={name}>
          <span>{name}</span>
          <input
            type="range"
            aria-label={`Frame ${label} ${channel} curve ${name.toLowerCase()}`}
            min="0"
            max="255"
            step="1"
            value={curve[i]}
            onChange={(e) => update(i, e.target.valueAsNumber)}
          />
          <output>{curve[i]}</output>
        </label>
      ))}
      <p>
        Drag a point vertically, or use the sliders. Master RGB is applied
        before each channel curve. Endpoints stay at 0 and 255.
      </p>
    </details>
  );
}
