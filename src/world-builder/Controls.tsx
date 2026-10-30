import { useEffect, useState } from "react";
import { parameterSchema, type Parameter, type Recipe } from "./recipe";
export function NumberControl({
  label,
  value,
  min,
  max,
  step = 1,
  change,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  change: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="wb-number">
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value);
          if (
            e.target.value.trim() &&
            Number.isFinite(e.target.valueAsNumber) &&
            e.target.valueAsNumber >= min &&
            e.target.valueAsNumber <= max
          )
            change(e.target.valueAsNumber);
        }}
        onBlur={() => setDraft(String(value))}
      />
    </label>
  );
}
export function Parameters({
  recipe,
  names,
  change,
}: {
  recipe: Recipe;
  names: Parameter[];
  change: (patch: Partial<Recipe>) => void;
}) {
  return (
    <div className="wb-numbers">
      {names.map((name) => (
        <NumberControl
          key={name}
          label={name}
          value={recipe[name]}
          {...parameterSchema[name]}
          change={(value) => change({ [name]: value })}
        />
      ))}
    </div>
  );
}
