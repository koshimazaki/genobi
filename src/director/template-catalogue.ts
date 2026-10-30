/**
 * Legacy slot metadata for imported/saved projects. These placeholders are
 * retired from the picker and cannot be loaded as new templates.
 * Project media, named replacements and generation targets still use their slots.
 */
const legacySlots = [
  {
    id: "character-intro",
    slots: [
      {
        id: "character",
        label: "Character",
        hint: "Image or prepared video · used in both shots",
        layerIds: ["character-wide", "character-close"],
      },
    ],
  },
  {
    id: "outfit-reveal",
    slots: [
      {
        id: "before",
        label: "Before",
        hint: "Original look · first 3 seconds",
        layerIds: ["outfit-before"],
      },
      {
        id: "after",
        label: "After",
        hint: "Prepared new look · last 3 seconds",
        layerIds: ["outfit-after"],
      },
    ],
  },
  {
    id: "poster-motion",
    slots: [
      {
        id: "poster",
        label: "Poster image",
        hint: "Image or prepared video · 6 seconds",
        layerIds: ["poster-image"],
      },
    ],
  },
] as const;

export function findTemplate(id: string | null) {
  return legacySlots.find((t) => t.id === id);
}
