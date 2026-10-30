import { adaptiveReverb } from "./adaptive-reverb";
import { animeTeaser } from "./anime-teaser";
import { bloomTeaser } from "./bloom-teaser";
import { dimensionsMix } from "./dimensions-mix";
import { genobiTeaser } from "./genobi-teaser";
import { sheetToShot } from "./sheet-to-shot";
import type { HouseTemplate } from "./types";
import { fallingRoom } from "./falling-room";

/**
 * The three house-style templates (issue #20), the anime teaser
 * (`anime-teaser.ts`, Box 2.2) and Sheet to shot (`sheet-to-shot.ts`, the
 * gallery's first mechanical template). Each is data: the brief pieces
 * every shot repeats, the shots with their registry entry, length and camera
 * terms, the references it expects and the Director tracks it opens with.
 * `planTemplate` turns one and its inputs into the runs it would make; the
 * Director opens one at `/director?example=<id>`. See docs/templates.md.
 */
export const productVideo: HouseTemplate = {
  id: "product-video",
  name: "Product video",
  description: "A product on a plinth: hero, detail and reveal, named in type.",
  tier: "open",
  style: {
    name: "Plinth",
    look: "The set is a seamless warm-grey studio with one plaster plinth and nothing else in it.",
    lighting:
      "A large soft key from the left and a thin rim light trace its edges, and shadows fall short and soft.",
    palette:
      "The palette stays to plaster white, warm grey and graphite, so the product is the only saturated colour.",
    swatches: [
      { name: "Plaster", hex: "#e9e5dd" },
      { name: "Warm grey", hex: "#b8b2a7" },
      { name: "Graphite", hex: "#2a2a2b" },
    ],
    negativeSpace:
      "The upper third of the frame stays empty for the product name, and no lettering appears in the shot.",
  },
  inputs: {
    subject: {
      label: "Product",
      hint: "What it is and what it is made of, as you would brief a set builder.",
      default: "a matte black portable speaker with a woven fabric front",
    },
    title: {
      label: "Product name",
      hint: "Set in the type track over the reveal.",
      default: "FIELD ONE",
    },
    aspects: ["16:9", "9:16"],
  },
  references: [
    {
      id: "product",
      label: "Product photos",
      kind: "image",
      role: "product",
      min: 0,
      max: 3,
      hint: "Optional. Kept with each shot's plan for image to video; text to video reads the description.",
    },
  ],
  shots: [
    {
      id: "hero",
      label: "Hero",
      entry: "ltx-2-5-fast",
      length: { seconds: 4 },
      camera: {
        "shot-sizes": "full",
        angles: "eye-level",
        movements: "dolly-in",
      },
      action: "{subject} stands alone on the plinth, perfectly still.",
      references: ["product"],
    },
    {
      id: "detail",
      label: "Detail",
      entry: "ltx-2-5-fast",
      length: { seconds: 3 },
      camera: {
        "shot-sizes": "extreme-close-up",
        angles: null,
        movements: "pan",
      },
      action:
        "Light rakes across one edge of {subject}, picking out its material and finish.",
      references: ["product"],
    },
    {
      id: "reveal",
      label: "Reveal",
      entry: "ltx-2-5-fast",
      length: { seconds: 4 },
      camera: {
        "shot-sizes": null,
        angles: "low-angle",
        movements: "pull-back",
      },
      action: "{subject} turns a quarter turn on the plinth and settles.",
      references: ["product"],
    },
  ],
  tracks: [
    { kind: "shots", id: "shots", name: "Shots" },
    {
      kind: "type",
      id: "title",
      name: "Product name",
      from: "reveal",
      size: 40,
      // Light type: the caption recipe sets it on a dark scrim.
      swatch: 0,
    },
  ],
  examples: [],
};

export const characterPiece: HouseTemplate = {
  id: "character-piece",
  name: "Character piece",
  description: "One character held across three shots: arrive, turn, hold.",
  tier: "open",
  style: {
    name: "North light",
    look: "The room is bare, with lime-washed walls, a pale wooden floor and one tall window.",
    lighting:
      "Soft north light from the window falls from one side, shadows stay open and skin keeps its texture.",
    palette:
      "The palette stays to chalk, oat, faded olive and ink, and the wardrobe repeats it.",
    swatches: [
      { name: "Chalk", hex: "#ece8df" },
      { name: "Oat", hex: "#d6c9b1" },
      { name: "Faded olive", hex: "#8a8b6a" },
      { name: "Ink", hex: "#1f2326" },
    ],
    negativeSpace:
      "The character stays off-centre, with open wall on the far side of the frame.",
  },
  inputs: {
    subject: {
      label: "Character",
      hint: "Who they are and what they wear. It is repeated word for word in every shot, which is what holds them.",
      default:
        "a woman in her thirties with cropped dark hair, an oat linen jacket and a faded olive scarf",
    },
    title: {
      label: "Name",
      hint: "Set in the type track on the last shot.",
      default: "ANNA",
    },
    aspects: ["9:16", "16:9"],
  },
  references: [
    {
      id: "character",
      label: "Character stills",
      kind: "image",
      role: "character",
      min: 1,
      max: 3,
      hint: "One to three stills of the same person, carried by every shot's plan. FLUX 3 Image Klein makes them with open weights.",
      madeWith: "flux-3-klein",
    },
  ],
  shots: [
    {
      id: "arrive",
      label: "Arrive",
      entry: "ltx-2-5-fast",
      length: { seconds: 4 },
      camera: {
        "shot-sizes": "full",
        angles: "eye-level",
        movements: "pan",
      },
      action:
        "{subject} walks in through a pale doorway and stops by the window.",
      references: ["character"],
    },
    {
      id: "turn",
      label: "Turn",
      entry: "ltx-2-5-fast",
      length: { seconds: 4 },
      camera: {
        "shot-sizes": "close-up",
        angles: null,
        movements: "orbit",
      },
      action:
        "{subject} turns toward the window light, eyes closing for a moment.",
      references: ["character"],
    },
    {
      id: "hold",
      label: "Hold",
      entry: "ltx-2-5-fast",
      length: { seconds: 3 },
      camera: {
        "shot-sizes": "medium",
        angles: "eye-level",
        movements: "static",
      },
      action:
        "{subject} looks straight into the lens and holds still for a breath.",
      references: ["character"],
    },
  ],
  tracks: [
    { kind: "shots", id: "shots", name: "Shots" },
    {
      kind: "type",
      id: "title",
      name: "Name",
      from: "hold",
      size: 32,
      swatch: 0,
    },
  ],
  examples: [],
};

export const audioVisual: HouseTemplate = {
  id: "audio-visual",
  name: "Audio-visual",
  description:
    "A music-led piece: the track sets the cuts, the room sets the sound.",
  tier: "open",
  style: {
    name: "Slab light",
    look: "The space is raw board-marked concrete, deep shadow and a single hard light source.",
    lighting:
      "Hard white light cuts in sharp slices, and everything outside them falls to near black.",
    palette:
      "The palette stays to concrete grey, bone white and black, with one sodium-orange accent.",
    swatches: [
      { name: "Concrete", hex: "#8d8a85" },
      { name: "Bone", hex: "#e6e1d6" },
      { name: "Black", hex: "#0e0e0f" },
      { name: "Sodium", hex: "#e2762b" },
    ],
    negativeSpace:
      "Large planes of shadow keep most of the frame empty, and no people appear.",
  },
  inputs: {
    subject: {
      label: "Space",
      hint: "An architectural or abstract space, without people.",
      default: "a brutalist concrete atrium",
    },
    title: {
      label: "Title",
      hint: "Set in the type track on the last bar.",
      default: "STRUCTURE",
    },
    aspects: ["16:9"],
    bpm: { default: 120, min: 60, max: 180 },
    acoustic: { mode: "room", preset: "cathedral", level: "mid" },
  },
  references: [
    {
      id: "track",
      label: "Track",
      kind: "audio",
      role: "track",
      min: 1,
      max: 1,
      hint: "The music. Its tempo sets the cuts: each shot is one bar, cut on the downbeat.",
    },
  ],
  shots: [
    {
      id: "slice",
      label: "Slice",
      entry: "ltx-2-5-akuspace",
      length: { bars: 1 },
      camera: {
        "shot-sizes": "establishing",
        angles: null,
        movements: "dolly-in",
      },
      action:
        "A blade of light opens across {subject}, dust hanging in the beam.",
      references: [],
    },
    {
      id: "rise",
      label: "Rise",
      entry: "ltx-2-5-akuspace",
      length: { bars: 1 },
      camera: { "shot-sizes": "wide", angles: null, movements: "crane" },
      action: "Light climbs the walls of {subject} in hard bands.",
      references: [],
    },
    {
      id: "sweep",
      label: "Sweep",
      entry: "ltx-2-5-akuspace",
      length: { bars: 1 },
      camera: {
        "shot-sizes": "wide",
        angles: "high-angle",
        movements: "orbit",
      },
      action: "A single slice of light sweeps across the floor of {subject}.",
      references: [],
    },
  ],
  tracks: [
    { kind: "audio", id: "track", name: "Track", reference: "track" },
    { kind: "shots", id: "shots", name: "Shots" },
    {
      kind: "graphics",
      id: "pulse",
      name: "Pulse",
      module: "rings",
      swatch: 3,
      count: 3,
      opacity: 0.35,
    },
    {
      kind: "type",
      id: "title",
      name: "Title",
      from: "sweep",
      size: 28,
      swatch: 1,
    },
  ],
  examples: [],
};

export { animeTeaser, sheetToShot };
export const houseTemplates: readonly HouseTemplate[] = [
  productVideo,
  characterPiece,
  audioVisual,
  animeTeaser,
  sheetToShot,
  fallingRoom,
];

export const findHouseTemplate = (id: string | null | undefined) =>
  houseTemplates.find((t) => t.id === id);

/**
 * The mix templates (`run: "mix"`, `dimensions-mix.ts`): finished cuts of
 * bundled media. They are not house templates, since they plan no runs, so
 * the planner, the agent tools and `findHouseTemplate` do not see them; the
 * gallery lists them first and the Director opens them.
 */
export { dimensionsMix, genobiTeaser };
export const mixTemplates: readonly HouseTemplate[] = [
  dimensionsMix,
  genobiTeaser,
  bloomTeaser,
  adaptiveReverb,
];
export const findMixTemplate = (id: string | null | undefined) =>
  mixTemplates.find((t) => t.id === id);
