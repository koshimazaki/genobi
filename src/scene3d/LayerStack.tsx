/**
 * The combo layer stack, redrawn from Holodeck's
 * `components/ui/CameraComboLayerStack.tsx` and the amount and morph sliders
 * of `CameraComboPanel.tsx` (MIT, Glitch Candies Studio), without the
 * timeline. Each row is one additive layer: the bar is its progress, the
 * underline its morph weight, read at the current time.
 */
import { useId } from "react";
import { moveLabel, type CameraPlate } from "./plates";
import { RIG_LIMITS, type LayerReading, type RigSettings } from "./combo";

/** Holodeck's default stack depth; empty rows keep the panel's height. */
const STACK_ROWS = 3;

export function LayerStack({
  plate,
  layers,
  rig,
  onRig,
}: {
  plate: CameraPlate;
  layers: LayerReading[];
  rig: RigSettings;
  onRig: (patch: Partial<RigSettings>) => void;
}) {
  const combo = plate.kind === "combo";
  return (
    <section className="s3d-stack" aria-label="Combo layers">
      <header>
        <span>Layer stack</span>
        <span>{combo ? "COMBO" : "SINGLE"}</span>
      </header>
      <ol>
        {Array.from(
          { length: Math.max(STACK_ROWS, layers.length) },
          (_, i) => layers[i],
        ).map((layer, i) =>
          layer ? (
            <li key={i} data-layer={i}>
              <span
                className="s3d-stack-progress"
                style={{ width: `${layer.phase * 100}%` }}
              />
              <span
                className="s3d-stack-weight"
                style={{ width: `${layer.weight * 100}%` }}
              />
              <span className="s3d-stack-name">{moveLabel(layer.move)}</span>
              <span className="s3d-stack-meta">
                {Math.round(layer.weight * 100)}% morph
              </span>
            </li>
          ) : (
            <li key={i} data-empty="">
              <span className="s3d-stack-name">empty</span>
              <span className="s3d-stack-meta">--</span>
            </li>
          ),
        )}
      </ol>
      <div className="s3d-sliders">
        <Slider
          label="Amount"
          readout={`${Math.round(rig.strength * 100)}%`}
          limits={RIG_LIMITS.strength}
          value={rig.strength}
          disabled={!combo}
          onChange={(strength) => onRig({ strength })}
        />
        <Slider
          label="Morph"
          readout={`${rig.morph.toFixed(1)} s`}
          limits={RIG_LIMITS.morph}
          value={rig.morph}
          disabled={!combo}
          onChange={(morph) => onRig({ morph })}
        />
      </div>
    </section>
  );
}

/** The label names the range; the readout sits beside it, outside the label. */
function Slider({
  label,
  readout,
  limits,
  value,
  disabled,
  onChange,
}: {
  label: string;
  readout: string;
  limits: { min: number; max: number; step: number };
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="s3d-slider">
      <div className="s3d-slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{readout}</output>
      </div>
      <input
        id={id}
        type="range"
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
