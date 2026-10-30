import type { ReactNode, Ref } from "react";
import { presets, type Preset } from "./presets";
import { PresetIcon } from "./PresetIcon";
import { NinjaConfigButton } from "./NinjaControls";

export function StudioNavigation({
  preset,
  onSelect,
  editing,
  onToggle,
  configButton,
  filters,
}: {
  preset: Preset;
  onSelect: (preset: Preset) => void;
  editing: boolean;
  onToggle: () => void;
  configButton: Ref<HTMLButtonElement>;
  filters: ReactNode;
}) {
  return (
    <div className="genobi-modebar">
      <nav className="genobi-presets" aria-label="Studio presets">
        {presets.map((p) => (
          <div className="genobi-preset-item" key={p.id}>
            <button
              data-preset-button={p.id}
              title={`${p.label} · ${p.description}`}
              aria-label={p.label}
              aria-pressed={preset === p.id}
              onClick={() => onSelect(p.id)}
            >
              <PresetIcon name={p.icon} />
              <span>{p.label}</span>
            </button>
            {p.id === "ninja" && preset === "ninja" && (
              <NinjaConfigButton
                ref={configButton}
                editing={editing}
                onToggle={onToggle}
              />
            )}
          </div>
        ))}
      </nav>
      <div className="gallery-filter-slot">{filters}</div>
    </div>
  );
}
