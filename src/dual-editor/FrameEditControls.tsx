import type { FrameEdits } from "./useFrameEdits";
import ColorCurves from "./ColorCurves";
import type { AdjustmentKey } from "./frame-adjustments";

const controls: [AdjustmentKey, string, number, number, number][] = [
  ["exposure", "Exposure · EV", -2, 2, 0.05],
  ["brightness", "Brightness", -50, 50, 1],
  ["contrast", "Contrast", -100, 100, 1],
  ["saturation", "Saturation", -100, 100, 1],
  ["hue", "Hue · °", -180, 180, 1],
];
export default function FrameEditControls({
  label,
  edit,
  other,
}: {
  label: "A" | "B";
  edit: FrameEdits;
  other: FrameEdits;
}) {
  return (
    <div className="de-frame-edit" aria-label={`Frame ${label} adjustments`}>
      <header>
        <span className="de-eyebrow">FRAME FINISH / NONDESTRUCTIVE</span>
        <button className="de-text-button" onClick={edit.reset}>
          Reset
        </button>
      </header>
      {controls.map(([key, title, min, max, step]) => (
        <label className="de-adjustment" key={key}>
          <span>{title}</span>
          <input
            aria-label={`Frame ${label} ${key}`}
            type="range"
            min={min}
            max={max}
            step={step}
            value={edit.settings[key]}
            onChange={(e) =>
              edit.setSettings({
                ...edit.settings,
                [key]: e.target.valueAsNumber,
              })
            }
          />
          <output>
            {edit.settings[key] > 0 ? "+" : ""}
            {edit.settings[key]}
          </output>
        </label>
      ))}
      <ColorCurves label={label} edit={edit} />
      <div className="de-cut-actions">
        <button
          className="de-button"
          aria-pressed={edit.original}
          onClick={() => edit.showOriginal(!edit.original)}
        >
          {edit.original ? "Show edited" : "Compare original"}
        </button>
        <button
          className="de-button"
          disabled={!other.slot.ready}
          onClick={() => edit.setSettings({ ...other.settings })}
        >
          Copy {label === "A" ? "B" : "A"} adjustments
        </button>
      </div>
      <details className="de-background-tools">
        <summary>Background · local AI</summary>
        <p>
          Separate the foreground, then export transparency or place it over the
          other frame. First use downloads a 183 MB MIT model; your image stays
          on this device.
        </p>
        <div className="de-cut-actions">
          <button
            className="de-button"
            disabled={!edit.slot.ready || edit.busy}
            onClick={edit.removeBackground}
          >
            {edit.hasMask ? "Separate again" : "Remove background"}
          </button>
          <button
            className="de-button"
            disabled={!edit.hasMask || !other.slot.ready}
            onClick={() => edit.setBackground(other.slot.shown!.canvas)}
          >
            Use {label === "A" ? "B" : "A"} as background
          </button>
          {edit.background && (
            <button
              className="de-button"
              onClick={() => edit.setBackground(null)}
            >
              Transparent background
            </button>
          )}
          {edit.busy && (
            <button className="de-button" onClick={edit.cancel}>
              Cancel
            </button>
          )}
        </div>
        <p role="status">
          {edit.status ||
            "512 px alpha matte, enlarged to your original frame. Best with a clearly separated subject. The other frame is used whole and center-cropped to fill."}
        </p>
      </details>
    </div>
  );
}
