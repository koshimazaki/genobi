import TickFader from "./TickFader";

export default function UpscaleControls({
  factor,
  creativity,
  open = false,
  onFactorChange,
  onCreativityChange,
}: {
  factor: number;
  creativity: 0 | 1;
  /**
   * SeedVR2, the open upscaler: one restore pass and no Creative mode, so the
   * mode segments say so in their place rather than offering a choice.
   */
  open?: boolean;
  onFactorChange: (factor: number) => void;
  onCreativityChange: (creativity: 0 | 1) => void;
}) {
  return (
    <div className="upscale-controls">
      <div className="upscale-amount">
        <TickFader
          id="upscale-factor"
          label="Upscale amount"
          value={factor}
          min={1.5}
          max={3}
          step={0.1}
          onChange={onFactorChange}
          valueLabel={`${factor}×`}
        />
      </div>
      {open ? (
        <p className="upscale-mode upscale-mode--open">
          Open weights · one restore pass
        </p>
      ) : (
        <fieldset className="upscale-mode">
          <legend className="sr-only">Upscale mode</legend>
          <div className="mode-segments">
            {([0, 1] as const).map((mode) => (
              <label key={mode}>
                <input
                  type="radio"
                  name="upscale-mode"
                  value={mode}
                  checked={creativity === mode}
                  onChange={() => onCreativityChange(mode)}
                />
                <span>{mode === 0 ? "Precise" : "Creative"}</span>
              </label>
            ))}
          </div>
          <p className="sr-only">
            {creativity === 0
              ? "Preserves original detail"
              : "Reimagines finer detail"}
          </p>
        </fieldset>
      )}
    </div>
  );
}
