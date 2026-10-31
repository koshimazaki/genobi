import { useId } from "react";
import type { EffectPreset } from "../../shared/effects";
import type { Parameters } from "../../shared/director/types";

export function EffectControls({
  preset,
  parameters,
  change,
}: {
  preset: EffectPreset;
  parameters: Parameters;
  change: (key: string, value: string | number | boolean) => void;
}) {
  const prefix = useId();
  return (
    <div className="effect-controls">
      {preset.controls.map((control) => {
        const id = `${prefix}-${control.key}`;
        const value = parameters[control.key];
        return (
          <label
            key={control.key}
            htmlFor={id}
            className={`effect-control effect-control-${control.type}`}
          >
            <span>
              {control.label}
              {control.type === "number" && (
                <output>
                  {Number(value).toFixed(control.integer ? 0 : 2)}
                </output>
              )}
            </span>
            {control.type === "number" ? (
              <input
                id={id}
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={Number(value)}
                onChange={(e) => change(control.key, Number(e.target.value))}
              />
            ) : control.type === "boolean" ? (
              <input
                id={id}
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => change(control.key, e.target.checked)}
              />
            ) : control.type === "select" ? (
              <select
                id={id}
                value={String(value)}
                onChange={(e) => change(control.key, e.target.value)}
              >
                {control.options.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type={control.type === "color" ? "color" : "text"}
                value={String(value)}
                maxLength={
                  control.type === "text" ? control.maxLength : undefined
                }
                onChange={(e) => change(control.key, e.target.value)}
              />
            )}
            {control.description && <small>{control.description}</small>}
          </label>
        );
      })}
    </div>
  );
}
