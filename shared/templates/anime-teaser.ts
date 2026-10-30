import type { HouseTemplate, TemplateShot } from "./types";

/**
 * The H3 prompt pattern (docs/anime-teaser-template.md, step 6): name both
 * images, hold the character, follow one storyboard panel as one continuous
 * shot, then the panel's sentence and the camera in words. The shots pick no
 * camera term: each storyboard panel already sets the viewpoint, and which
 * wins when a term disagrees is open (docs/minimax-h3-camera.md). The panel
 * sentences here are the template's own; the `anime-teaser` skill replaces
 * each with the sentence under that panel of the storyboard it used.
 */
export const panel = (n: 1 | 2, sentence: string, camera: string) =>
  `Use the first image as the character sheet and the second as the storyboard. The same character throughout; follow the storyboard panel ${n}; one smooth continuous shot with no cuts or transitions; ${sentence}; ${camera}.`;

const shot = (id: string, label: string, action: string): TemplateShot => ({
  id,
  label,
  entry: "minimax-h3-router",
  length: { seconds: 10 },
  camera: { "shot-sizes": null, angles: null, movements: null },
  action,
  // The sheet first and the storyboard second, as the prompt names them.
  references: ["character", "storyboard"],
});

/**
 * The anime teaser (Box 2.2): drop a track, a character sheet and a
 * storyboard, or let Genobi make them; two 10-second MiniMax H3 shots from
 * the sheet and the storyboard, cut to the track's beat with two titles.
 * Every reference is optional, because each can be generated: the sheet and
 * the storyboard with FLUX 3 Edit from the Scrolls examples (closed, so the
 * template is Semi-open), the track as four MiniMax Music 3 candidates.
 */
export const animeTeaser: HouseTemplate = {
  id: "anime-teaser",
  name: "Anime teaser",
  // Two shots, generated references and a cut to the track: an agent's job.
  run: "agent",
  description:
    "Two 10-second shots from a sheet and a storyboard, cut to the beat.",
  tier: "semi-open",
  style: {
    name: "Ink and ember",
    look: "Hand-drawn 2D anime in a painterly style, in the line and colour of the character sheet.",
    lighting:
      "Hard rim light and painted glows, with every effect drawn as flat textured brushstrokes, never glossy CG.",
    palette:
      "The palette follows the sheet, with ink-blue shadows, dusk teal and one ember accent.",
    swatches: [
      { name: "Paper", hex: "#f4efe6" },
      { name: "Ink", hex: "#0f1420" },
      { name: "Dusk teal", hex: "#1f3a4a" },
      { name: "Ember", hex: "#e0602a" },
    ],
    negativeSpace:
      "No words, subtitles or logos appear in the frame; the titles are added in the edit.",
  },
  inputs: {
    subject: {
      label: "Brief",
      hint: "Who the character is and what they do. One invented character, never a real or famous person.",
      default:
        "a ninja training in a forest, shooting a fireball and doing kicks",
    },
    title: {
      label: "Title",
      hint: "The title card on the opening beat and the caption on the held last second.",
      default: "FIRE FIST",
    },
    aspects: ["16:9", "9:16"],
  },
  references: [
    {
      id: "track",
      label: "Track",
      kind: "audio",
      role: "track",
      min: 0,
      max: 1,
      hint: "WAV or MP3, about 20 seconds. Without one, MiniMax Music 3 makes four instrumental candidates to choose from.",
      madeWith: "minimax-music-3",
      candidates: 4,
    },
    {
      id: "character",
      label: "Character sheet",
      kind: "image",
      role: "character",
      min: 0,
      max: 1,
      hint: "Front, back and side, plus one move. Without one, FLUX 3 Edit draws it from the brief in the example sheet's layout.",
      madeWith: "flux-3-edit",
      example: "/scrolls/character.png",
    },
    {
      id: "storyboard",
      label: "Storyboard",
      kind: "image",
      role: "storyboard",
      min: 0,
      max: 1,
      hint: "Two panels, one per shot, each with one sentence. Without one, FLUX 3 Edit draws it in the example storyboard's layout.",
      madeWith: "flux-3-edit",
      example: "/scrolls/storyboard.png",
    },
  ],
  shots: [
    shot(
      "open",
      "Open",
      panel(
        1,
        "{subject}, building to the first strike",
        "the camera pushes in slowly toward the character",
      ),
    ),
    shot(
      "drop",
      "Drop",
      panel(
        2,
        "{subject}, landing the biggest move on the drop",
        "the camera tracks alongside the character from a low angle",
      ),
    ),
  ],
  tracks: [
    { kind: "audio", id: "track", name: "Track", reference: "track" },
    { kind: "shots", id: "shots", name: "Shots" },
    {
      kind: "type",
      id: "title",
      name: "Title",
      from: "drop",
      size: 36,
      swatch: 0,
    },
  ],
  examples: [],
};
