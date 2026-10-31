import { useMemo, useRef, useState } from "react";
import {
  EFFECT_VARIANT_BYTES,
  listEffectPresets,
  parseEffectVariantJson,
  type EffectVariant,
} from "../../shared/effects";
import { EffectPresetEditor } from "./EffectPresetEditor";
import { EffectPreview } from "./EffectPreview";
import { useEffectVariants } from "./useEffectVariants";
import { variantKey } from "./variant-store";
import "./effects.css";

/** The same configurable effect recipes, also usable inside Editor's Add UI. */
export function EffectsPicker() {
  const presets = useMemo(listEffectPresets, []);
  const [selected, setSelected] = useState(presets[0].id);
  const [variant, setVariant] = useState<EffectVariant>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importVersion, setImportVersion] = useState(0);
  const { variants, save, remove } = useEffectVariants();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="effects-picker">
      <div className="effects-picker-bar">
        <strong>Animations & Effects</strong>
        <button type="button" onClick={() => input.current?.click()}>
          Import variant
        </button>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept=".json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setNotice("");
          try {
            if (file.size > EFFECT_VARIANT_BYTES)
              throw new Error("Effect variant is too large (16 KB maximum).");
            const next = parseEffectVariantJson(await file.text());
            const persisted = save(next);
            setSelected(next.presetId);
            setVariant(next);
            setImportVersion((version) => version + 1);
            setError("");
            setNotice(
              persisted
                ? "Variant imported and saved in this browser."
                : "Variant imported for this tab only. Export a copy to keep it.",
            );
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      />
      <div className="effect-picker-cards">
        {presets.map((preset) => (
          <button
            type="button"
            key={preset.id}
            className="effect-picker-card"
            aria-pressed={selected === preset.id && !variant}
            onClick={() => {
              setSelected(preset.id);
              setVariant(undefined);
            }}
          >
            <EffectPreview
              preset={preset}
              parameters={preset.defaults}
              compact
            />
            <strong>{preset.name}</strong>
            <small>{preset.family}</small>
          </button>
        ))}
      </div>
      {variants.length > 0 && (
        <div
          className="effect-variant-pills"
          role="group"
          aria-label="Saved effect variants"
        >
          {variants.map((v) => (
            <button
              type="button"
              key={variantKey(v)}
              aria-pressed={!!variant && variantKey(variant) === variantKey(v)}
              onClick={() => {
                setSelected(v.presetId);
                setVariant(v);
              }}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
      <EffectPresetEditor
        key={`${variant ? variantKey(variant) : selected}:${importVersion}`}
        presetId={selected}
        variant={variant}
        onSave={save}
        onRemove={
          variant
            ? () => {
                remove(variant);
                setVariant(undefined);
              }
            : undefined
        }
      />
      {notice && (
        <p role="status" className="effect-message">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="effect-error">
          {error}
        </p>
      )}
    </div>
  );
}
