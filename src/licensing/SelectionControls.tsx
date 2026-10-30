import ThemedSelect from "../components/ThemedSelect";
import { useState } from "react";
import type { SelectionPreference } from "../../shared/licensing/selection";
import { readSelection, saveSelection } from "./preferences";

const controls = [
  {
    key: "family",
    label: "Creative models",
    options: [
      ["any", "No preference"],
      ["flux", "FLUX only"],
      ["ltx", "LTX only"],
      ["h3", "H3 only"],
      ["upscale", "Upscale only"],
    ],
  },
  {
    key: "weights",
    label: "Model weights",
    options: [
      ["any", "Open or closed models"],
      ["open-weights", "Open weights only"],
      ["commercial", "Commercial models only"],
    ],
  },
  {
    key: "execution",
    label: "Where generation runs",
    options: [
      ["any", "Local or cloud"],
      ["local", "Local only"],
      ["cloud", "Cloud only"],
    ],
  },
  {
    key: "agent",
    label: "Preferred agent host",
    options: [
      ["any", "No preference"],
      ["hermes", "Hermes"],
      ["claude", "Claude Code"],
      ["codex", "Codex"],
    ],
  },
] as const;

export default function SelectionControls() {
  const [selection, setSelection] = useState<SelectionPreference>(
    () => readSelection() ?? {},
  );
  return (
    <section
      className="taste-preference"
      aria-label="Global model and execution preferences"
    >
      <p>
        <strong>Global setup defaults</strong> · Reused by new sessions in this
        browser. Override them in a session prompt without changing these
        defaults.
      </p>
      {controls.map(({ key, label, options }) => (
        <label key={key}>
          {label}
          <ThemedSelect
            value={selection[key] ?? "any"}
            onChange={(event) => {
              const next = { ...selection, [key]: event.target.value };
              saveSelection(next);
              setSelection(next);
            }}
          >
            {options.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </ThemedSelect>
        </label>
      ))}
      <p>
        Saved for new agent briefs. Open weights can run locally or in the
        cloud; their commercial terms still apply. Agent preference guides setup
        and handoff; it does not switch the active runner. Paid runs still need
        approval.
      </p>
    </section>
  );
}
