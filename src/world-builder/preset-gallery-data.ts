import type { EffectPreset, EffectVariant } from "../../shared/effects";
import type { ScenePreset } from "./world-presets";
import { variantKey } from "../effects/variant-store";

export const PRESET_FILTERS = [
  "All",
  "Scenes",
  "Motion",
  "Effects",
  "Saved",
] as const;
export type PresetFilter = (typeof PRESET_FILTERS)[number];
export type GalleryPreset =
  | {
      key: string;
      kind: "scene";
      name: string;
      summary: string;
      category: "Scenes" | "Motion";
      saved: boolean;
      scene: ScenePreset;
    }
  | {
      key: string;
      kind: "effect";
      name: string;
      summary: string;
      category: "Effects";
      saved: boolean;
      effect: EffectPreset;
      variant?: EffectVariant;
    };

export function galleryPresets(
  scenes: ScenePreset[],
  effects: EffectPreset[],
  variants: EffectVariant[],
): GalleryPreset[] {
  const sceneItems: GalleryPreset[] = scenes.map((scene) => ({
    key: `scene:${scene.source}:${scene.name}`,
    kind: "scene",
    name: scene.name,
    summary: scene.summary,
    category: scene.recipe.motion ? "Motion" : "Scenes",
    saved: scene.source === "saved",
    scene,
  }));
  const effectItems: GalleryPreset[] = effects.map((effect) => ({
    key: `effect:${effect.id}`,
    kind: "effect",
    name: effect.name,
    summary: effect.description,
    category: "Effects",
    saved: false,
    effect,
  }));
  const savedItems: GalleryPreset[] = variants.flatMap((variant) => {
    const effect = effects.find((p) => p.id === variant.presetId);
    return effect
      ? [
          {
            key: `variant:${variantKey(variant)}`,
            kind: "effect" as const,
            name: variant.name,
            summary: effect.description,
            category: "Effects" as const,
            saved: true,
            effect,
            variant,
          },
        ]
      : [];
  });
  return [
    ...sceneItems.filter((p) => p.category === "Motion"),
    ...effectItems,
    ...sceneItems.filter((p) => p.category !== "Motion"),
    ...savedItems,
  ];
}

export function filterPresets(
  items: GalleryPreset[],
  filter: PresetFilter,
  search: string,
) {
  const query = search.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      (filter === "All" ||
        (filter === "Saved" ? item.saved : item.category === filter)) &&
      `${item.name} ${item.summary} ${item.category}`
        .toLocaleLowerCase()
        .includes(query),
  );
}
