import cut from "./fruits-swap.cut.json";
import type { MixSpec } from "./mix";
import type { HouseTemplate, TemplateMix } from "./types";

const DIR = "/media/director-templates/fruits-swap" as const;
const CHARACTERS = ["mecha", "gorilla", "gold-ninja", "pink-cat"] as const;
const clip = (name: (typeof CHARACTERS)[number]) => ({
  kind: "video" as const,
  url: `${DIR}/fruits-swap-${name}.mp4` as const,
  path: `media/fruits-swap-${name}.mp4`,
  durationSeconds: 8.042,
});

/**
 * The bundled media: the owner's four LTX-2.5 Layout-to-Render (open
 * weights) renders of one dance guide (window 0 of the explode capture, the
 * same pose and the same 8.04 s of the loop), one character each (the
 * opening mecha `mecha-fruit-song-vox` from 2 November, the others
 * 3 November), encoded once from 2048 × 1152 to 1920 × 1080 (CRF 19, no
 * sound). The Retro Gaming typography is baked into the media (the font file
 * is not bundled): the title typed over the mecha's first 4.2 s (with a
 * swarm of the shower's pixel fruit over its shoulder), the swap words on the card stills and WATERMELON over the gold
 * ninja's drop frames. The owner's "Dance with Fruits" loop (music by
 * Koshimazaki, owner-made): its last 2.4 s under the 2.5 s Signal-black
 * splash, then the 9.0 s
 * loop from the voice four times, cut at 33.0 s, faded over the end card's
 * last 2.4 s, raised 0.6 dB to -14 LUFS, MP3 320 kb/s. The renders' own audio
 * starts sample-aligned with the loop, so each picture stays on the music it
 * was made for. See docs/fruits-swap.md.
 */
const media: TemplateMix["media"] = {
  "fruits-swap-splash": {
    kind: "video",
    url: `${DIR}/fruits-swap-splash.mp4`,
    path: "media/fruits-swap-splash.mp4",
    durationSeconds: 2.5,
  },
  ...Object.fromEntries(CHARACTERS.map((c) => [`fruits-swap-${c}`, clip(c)])),
  "fruits-swap-track": {
    kind: "audio",
    url: `${DIR}/fruits-swap-track.mp3`,
    path: "media/fruits-swap-track.mp3",
    durationSeconds: 33.0,
  },
};

/**
 * Dance with Fruits (3 November 2026, v5): a voxel dancer between two fruits,
 * swapped for another character on the loop. A splash of flying pixel fruit,
 * the mecha with the title typed on the beat, the gorilla on the loop restart
 * under a neon-pink surveillance scan whose box posterizes and turns to
 * wireframe (GORILLA SALSA DANCE UNLOCKED), the gold
 * ninja on the drop beat inside that loop (WATERMELON slammed over the
 * picture), the pink cat on the last loop, a flood of pixel fruit, and the
 * house end card. The swaps are hard cuts at the same guide frame, so the
 * pose carries across. Nothing is generated: `run: "mix"`. See
 * docs/fruits-swap.md.
 */
export const fruitsSwap: HouseTemplate = {
  id: "fruits-swap",
  name: "Dance with Fruits",
  run: "mix",
  description:
    "One dance, four characters: LTX-2.5 renders of the same guide swapped on the loop and the drop, with a pixel-fruit splash, typed title, swap words and an end card. Nothing to generate.",
  tier: "open",
  style: {
    name: "Signal swap",
    look: "The owner's voxel dancers on a grey studio floor, cut hard on the loop, with pixel fruit flying, Space.js swap cards, a neon-pink CAM 02 surveillance scan whose box degrades and pixel words.",
    lighting:
      "The renders' own soft studio light; the overlays add neon-pink lines and plates, pixel fruit and white words.",
    palette:
      "Studio grey and Signal black, with the fruits' red, yellow and green, neon-pink lines and white words.",
    swatches: [
      { name: "Signal", hex: "#0c0e0c" },
      { name: "Neon pink", hex: "#ff4dff" },
      { name: "White", hex: "#f6f8f2" },
    ],
    negativeSpace:
      "The dancer holds the centre third; the HUD keeps to the edges and swap words sit over the beat, not the whole loop.",
  },
  inputs: {
    subject: {
      label: "Piece",
      hint: "What the cut shows.",
      default: "a voxel dancer between two fruits, swapped on the beat",
    },
    title: {
      label: "Title",
      hint: "The end card's subtitle.",
      default: "DANCE WITH FRUITS",
    },
    aspects: ["16:9"],
  },
  references: [],
  shots: [],
  tracks: [],
  examples: [
    {
      id: "fruits-swap",
      video: "/media/template-gallery/fruits-swap.mp4",
      poster: "/media/template-gallery/fruits-swap.jpg",
      aspect: "16:9",
      inputs: {
        subject: "a voxel dancer between two fruits, swapped on the beat",
        title: "DANCE WITH FRUITS",
        aspect: "16:9",
      },
    },
  ],
  mix: { cut: cut as unknown as MixSpec, media },
};
