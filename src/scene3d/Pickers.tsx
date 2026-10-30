import ThemedSelect from "../components/ThemedSelect";
import { GESTURES } from "./gestures";
import { PLATES } from "./plates";
import { SCENES, EXAMPLE_SCENES, type SceneSpec } from "./scenes";

/** Loaded scenes are picked as `loaded:<id>`, apart from the built-ins. */
export const LOADED = "loaded:";

export function ScenePicker({
  value,
  loaded = [],
  onChange,
}: {
  value: string;
  loaded?: readonly SceneSpec[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="s3d-scene-picker">
      <span>Scene</span>
      <ThemedSelect
        aria-label="Scene"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {SCENES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
        <optgroup label="Starter examples">
          {EXAMPLE_SCENES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </optgroup>
        {loaded.map((s) => (
          <option key={`${LOADED}${s.id}`} value={`${LOADED}${s.id}`}>
            {s.label} (loaded)
          </option>
        ))}
      </ThemedSelect>
    </label>
  );
}

export function PlatePicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <fieldset className="s3d-plates">
      <legend>Camera plates</legend>
      <div>
        {PLATES.map((plate, i) => (
          <button
            key={plate.id}
            type="button"
            aria-pressed={plate.id === value}
            title={plate.summary}
            data-plate={plate.id}
            onClick={() => onPick(plate.id)}
          >
            <small>{String(i + 1).padStart(2, "0")}</small>
            <span>{plate.label}</span>
            {plate.kind === "combo" && <em>combo</em>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function GesturePicker({
  value,
  onToggle,
}: {
  value: readonly string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="s3d-gestures">
      <legend>Gestures</legend>
      <div>
        {GESTURES.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={value.includes(g.id)}
            title={g.summary}
            onClick={() => onToggle(g.id)}
          >
            {g.label}
            <small>{g.target}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
