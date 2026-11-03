import { memo, useId, useMemo } from "react";
import { MORPH_ASSETS } from "./morph-asset-catalogue";
import { createMotionPreset } from "./motion-presets";
import { SceneStatePreview } from "./SceneStatePreview";
import type { Recipe } from "./recipe";

export const MORPH_LETTERS = ["A", "B", "C", "D"];

/** Tick real authored forms; the draft's retained part count is chosen separately. */
export const MorphAssetPicker = memo(function MorphAssetPicker({
  selected,
  change,
}: {
  selected: string[];
  change: (ids: string[]) => void;
}) {
  const hint = useId();
  const previews = useMemo(() => {
    const recipes = new Map<string, Recipe>();
    for (const asset of MORPH_ASSETS)
      if (!recipes.has(asset.preset))
        recipes.set(asset.preset, createMotionPreset(asset.preset));
    return recipes;
  }, []);
  return (
    <fieldset className="wb-morph-assets" aria-describedby={hint}>
      <legend>
        Choose forms <span>{selected.length} / 4 selected</span>
      </legend>
      <p className="effect-note" id={hint}>
        Tick two to four forms. Selection order becomes A → B → C → D; reorder
        below.
      </p>
      <div className="wb-morph-asset-grid">
        {MORPH_ASSETS.map((asset) => {
          const index = selected.indexOf(asset.id);
          const checked = index >= 0;
          const blocked = !checked && selected.length === 4;
          const recipe = previews.get(asset.preset)!;
          return (
            <label
              className="wb-morph-asset"
              key={asset.id}
              data-selected={checked}
              data-disabled={blocked}
            >
              <input
                type="checkbox"
                aria-label={`Include ${asset.name}`}
                checked={checked}
                disabled={blocked}
                onChange={(event) =>
                  change(
                    event.target.checked
                      ? [...selected, asset.id]
                      : selected.filter((id) => id !== asset.id),
                  )
                }
              />
              {checked && (
                <b className="wb-morph-asset-letter" aria-hidden="true">
                  {MORPH_LETTERS[index]}
                </b>
              )}
              <SceneStatePreview
                recipe={recipe}
                frame={recipe.motion!.stateKeys[asset.state].frame}
              />
              <strong>{asset.name}</strong>
              <small>{asset.family}</small>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
});
