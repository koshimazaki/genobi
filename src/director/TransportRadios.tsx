/**
 * A transport choice as a row of radios (Snap, FPS): every option visible,
 * one tab stop, arrow keys between options, as native radios behave.
 */
export default function TransportRadios({
  name,
  label,
  value,
  options,
  change,
  disabled = false,
  title,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string; title?: string }[];
  change: (value: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <fieldset className="dir-radios" disabled={disabled} title={title}>
      <legend>{label}</legend>
      <div>
        {options.map((o) => (
          <label key={o.value} title={o.title}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              aria-label={`${label} ${o.label}`}
              onChange={() => change(o.value)}
            />
            <span aria-hidden="true">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
