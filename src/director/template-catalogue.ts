import character from "../../docs/director-bundle/templates/character-intro.png?url";
import before from "../../docs/director-bundle/templates/outfit-before.png?url";
import after from "../../docs/director-bundle/templates/outfit-after.png?url";
import poster from "../../docs/director-bundle/templates/poster-motion.png?url";

export const templates = [
  {
    id: "character-intro",
    name: "Character intro",
    description: "Two shots. One memorable entrance.",
    headline: "MEET YOUR NEXT CHARACTER",
    color: "#e4e8ed",
    preview: character,
    slots: [
      {
        id: "character",
        label: "Character",
        hint: "Image or prepared video · used in both shots",
        layerIds: ["character-wide", "character-close"],
        url: character,
      },
    ],
  },
  {
    id: "outfit-reveal",
    name: "Outfit reveal",
    description: "A before, an after, a new look.",
    headline: "SAME YOU. NEW ENERGY.",
    color: "#dafa81",
    preview: after,
    slots: [
      {
        id: "before",
        label: "Before",
        hint: "Original look · first 3 seconds",
        layerIds: ["outfit-before"],
        url: before,
      },
      {
        id: "after",
        label: "After",
        hint: "Prepared new look · last 3 seconds",
        layerIds: ["outfit-after"],
        url: after,
      },
    ],
  },
  {
    id: "poster-motion",
    name: "Poster in motion",
    description: "Your image becomes a moving poster.",
    headline: "MAKE SOME NOISE",
    color: "#dafa81",
    preview: poster,
    slots: [
      {
        id: "poster",
        label: "Poster image",
        hint: "Image or prepared video · 6 seconds",
        layerIds: ["poster-image"],
        url: poster,
      },
    ],
  },
] as const;
export type TemplateId = (typeof templates)[number]["id"];
export function findTemplate(id: string | null) {
  return templates.find((t) => t.id === id);
}
