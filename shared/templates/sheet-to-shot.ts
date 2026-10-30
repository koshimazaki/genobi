import { panel } from "./anime-teaser";
import type { HouseTemplate } from "./types";

/**
 * Sheet to shot: the gallery's first mechanical template. A character sheet
 * and a storyboard become one MiniMax H3 shot on Comfy Router, in the anime
 * teaser's prompt pattern (`panel`), so Generate swaps the person's two
 * images into the recipe and runs it in place: quoted, confirmed, one
 * submission. The Scrolls sheet and storyboard are its examples. It has no
 * example output yet; the gallery says "Preview coming soon" rather than
 * showing footage another recipe made.
 */
export const sheetToShot: HouseTemplate = {
  id: "sheet-to-shot",
  name: "Sheet to shot",
  run: "mechanical",
  description:
    "A character sheet and a storyboard become one H3 shot, run in place.",
  tier: "open",
  style: {
    name: "Sheet line",
    look: "The character, its rendering and its world follow the character sheet exactly, framed as the storyboard panel frames them.",
    lighting:
      "The light follows the storyboard panel, with the sheet's own colours of glow and shadow.",
    palette: "The palette is the sheet's own colour guide, with nothing added.",
    swatches: [
      { name: "Paper", hex: "#f2efe8" },
      { name: "Graphite", hex: "#26282c" },
      { name: "Reactor teal", hex: "#2bb5a8" },
    ],
    negativeSpace:
      "No words, subtitles, panel borders or logos appear in the frame.",
  },
  inputs: {
    subject: {
      label: "Action",
      hint: "What the character does in the panel. One invented character, never a real or famous person.",
      default:
        "the guardian lands at the sky gate and raises both arms to the portal",
    },
    title: {
      label: "Title",
      hint: "The project's name in the Director.",
      default: "SKY GATE",
    },
    aspects: ["16:9", "9:16"],
  },
  references: [
    {
      id: "character",
      label: "Character sheet",
      kind: "image",
      role: "character",
      min: 1,
      max: 1,
      hint: "Front, back and side views of one character, in its own line and colour.",
      example: "/scrolls/character.png",
    },
    {
      id: "storyboard",
      label: "Storyboard",
      kind: "image",
      role: "storyboard",
      min: 1,
      max: 1,
      hint: "A storyboard or sprite sheet; the shot follows its first panel.",
      example: "/scrolls/storyboard.png",
    },
  ],
  shots: [
    {
      id: "shot",
      label: "Shot",
      entry: "minimax-h3-router",
      length: { seconds: 6 },
      camera: { "shot-sizes": null, angles: null, movements: null },
      action: panel(
        1,
        "{subject}",
        "the camera cranes up slowly as the character lands",
      ),
      // The sheet first and the storyboard second, as the prompt names them.
      references: ["character", "storyboard"],
    },
  ],
  // The Director project names the shot; the gallery's run is the clip alone.
  tracks: [
    { kind: "shots", id: "shots", name: "Shots" },
    {
      kind: "type",
      id: "title",
      name: "Title",
      from: "shot",
      size: 32,
      swatch: 0,
    },
  ],
  examples: [],
};
