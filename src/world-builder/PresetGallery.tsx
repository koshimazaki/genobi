import { memo, useMemo, useRef, useState } from "react";
import {
  EFFECT_VARIANT_BYTES,
  listEffectPresets,
  parseEffectVariantJson,
} from "../../shared/effects";
import { EffectPresetEditor } from "../effects/EffectPresetEditor";
import { EffectPreview } from "../effects/EffectPreview";
import { useEffectVariants } from "../effects/useEffectVariants";
import { SceneStatePreview } from "./SceneStatePreview";
import { ScenePresetDetail } from "./ScenePresetDetail";
import { PRESET_NAME } from "./world-presets";
import type { SceneLibraryState } from "./useSceneLibrary";
import type { BuilderSession } from "./useBuilderSession";
import {
  filterPresets,
  galleryPresets,
  PRESET_FILTERS,
  type GalleryPreset,
  type PresetFilter,
} from "./preset-gallery-data";
import { PresetIcon } from "../studio/PresetIcon";
import "../effects/effects.css";
import "./preset-gallery.css";
import { MorphComposer } from "./MorphComposer";

const PresetArtwork = memo(function PresetArtwork({
  item,
  source,
}: {
  item: GalleryPreset;
  source?: HTMLCanvasElement;
}) {
  if (item.kind === "effect")
    return (
      <EffectPreview
        preset={item.effect}
        parameters={item.variant?.parameters ?? item.effect.defaults}
        source={source}
        compact
      />
    );
  const recipe = item.scene.recipe;
  return (
    <div className="preset-card-artwork">
      <SceneStatePreview
        recipe={recipe}
        frame={recipe.motion?.stateKeys[1]?.frame ?? 0}
      />
      {!recipe.motion && !recipe.objects.length && (
        <span className="preset-card-scene-icon">
          <PresetIcon name={recipe.avatar ? "ninja" : "cube"} />
          <small>{recipe.scene}</small>
        </span>
      )}
    </div>
  );
});

/** One gallery inside 3D. Browsing never changes either the scene or the edit. */
export function PresetGallery({
  s,
  lib,
  disabled,
  onConfigureScene,
}: {
  s: BuilderSession;
  lib: SceneLibraryState;
  disabled: boolean;
  onConfigureScene?: () => void;
}) {
  const effects = useMemo(listEffectPresets, []);
  const saved = useEffectVariants();
  const items = useMemo(
    () => galleryPresets(lib.presets, effects, saved.variants),
    [lib.presets, effects, saved.variants],
  );
  const [filter, setFilter] = useState<PresetFilter>("All");
  const [search, setSearch] = useState("");
  const [selectedKey, select] = useState(items[0]?.key ?? "");
  const [saveOpen, setSaveOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerStarted, setComposerStarted] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importVersion, setImportVersion] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = filterPresets(items, filter, search);
  const selected = matches.find((p) => p.key === selectedKey) ?? matches[0];
  return (
    <section
      className="preset-gallery"
      aria-label="Configurable preset catalogue"
    >
      <div className="preset-gallery-heading">
        <div>
          <span className="preset-eyebrow">BUILD FROM A STARTING POINT</span>
          <h2>Presets</h2>
        </div>
        <p>Scenes, motion and treatments. Choose one. Make it yours.</p>
        <div className="preset-gallery-tools">
          <button
            type="button"
            aria-pressed={composerOpen}
            onClick={() => {
              setComposerStarted(true);
              setComposerOpen(!composerOpen);
            }}
          >
            Build a morph
          </button>
          <button
            type="button"
            aria-expanded={saveOpen}
            onClick={() => setSaveOpen(!saveOpen)}
          >
            Save scene
          </button>
          <button type="button" onClick={() => input.current?.click()}>
            Import variant
          </button>
        </div>
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
            const variant = parseEffectVariantJson(await file.text());
            const persisted = saved.save(variant);
            setFilter("Saved");
            setSearch("");
            select(`variant:${variant.presetId}:${variant.name}`);
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
      {saveOpen && (
        <form
          className="preset-save-scene"
          onSubmit={(e) => {
            e.preventDefault();
            lib.savePreset(name);
            setName("");
          }}
        >
          <input
            aria-label="Preset name"
            placeholder="Name the current scene"
            maxLength={PRESET_NAME}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" disabled={disabled || !s.ready || !name.trim()}>
            Save current as preset
          </button>
          <small>Includes your current scene and motion settings.</small>
        </form>
      )}
      {composerStarted && (
        <div hidden={!composerOpen}>
          <MorphComposer
            active={composerOpen}
            disabled={disabled}
            load={lib.loadComposition}
            close={() => setComposerOpen(false)}
          />
        </div>
      )}
      <div hidden={composerOpen}>
        <div className="preset-gallery-toolbar">
          <div
            className="preset-gallery-filters"
            role="group"
            aria-label="Filter presets"
          >
            {PRESET_FILTERS.map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value}
                <span>{filterPresets(items, value, "").length}</span>
              </button>
            ))}
          </div>
          <label className="preset-gallery-search">
            <input
              type="search"
              aria-label="Search presets"
              placeholder="Find a preset…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {matches.length ? (
          <>
            <div
              className="preset-gallery-cards"
              role="group"
              aria-label="Preset choices"
            >
              {matches.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className="preset-gallery-card"
                  aria-pressed={selected?.key === item.key}
                  onClick={() => select(item.key)}
                  aria-label={`Preview ${item.name}`}
                >
                  <PresetArtwork
                    item={item}
                    source={s.canvas.current ?? undefined}
                  />
                  <span className="preset-card-copy">
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.saved ? "Saved" : item.category}</small>
                    </span>
                    <span className="preset-card-description">
                      {item.summary}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {selected?.kind === "scene" ? (
              <ScenePresetDetail
                key={selected.key}
                preset={selected.scene}
                disabled={disabled}
                load={lib.loadPreset}
                configure={onConfigureScene}
                remove={
                  selected.saved
                    ? () => lib.removePreset(selected.name)
                    : undefined
                }
              />
            ) : (
              selected?.kind === "effect" && (
                <EffectPresetEditor
                  key={`${selected.key}:${importVersion}`}
                  presetId={selected.effect.id}
                  variant={selected.variant}
                  source={s.canvas.current ?? undefined}
                  onSave={saved.save}
                  onRemove={
                    selected.variant
                      ? () => saved.remove(selected.variant!)
                      : undefined
                  }
                />
              )
            )}
          </>
        ) : (
          <div className="preset-empty">
            <strong>
              {filter === "Saved" && !search
                ? "Your collection starts here"
                : "No presets match"}
            </strong>
            <p>
              {filter === "Saved" && !search
                ? "Save a scene or customize an effect and save a variant. They will appear here."
                : "Try another name or clear the search."}
            </p>
            {search && (
              <button type="button" onClick={() => setSearch("")}>
                Clear search
              </button>
            )}
          </div>
        )}
      </div>
      {notice && (
        <p className="effect-message" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="effect-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
