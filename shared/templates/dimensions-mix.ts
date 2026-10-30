import cut from "./dimensions-mix.cut.json";
import type { MixSpec } from "./mix";
import type { HouseTemplate, TemplateMix } from "./types";

const DIR = "/media/director-templates/dimensions-mix" as const;
const clip = (n: 1 | 2 | 3) => ({
  kind: "video" as const,
  url: `${DIR}/mix-0${n}.mp4` as const,
  path: `media/mix-0${n}.mp4`,
  durationSeconds: 13.5,
});

/**
 * The bundled media: the owner's three MiniMax H3 (open weights) clips,
 * kept at their own 24 fps as 720 px squares without sound, and a
 * 23.2-second excerpt of the owner's track, credited "Dimensions ·
 * Koshimazaki Mix", from 25.55 s, at -14 LUFS. The end card is a layer, not
 * media: the `end-card` recipe builds it live with the Signal construction
 * effect, so its words are parameters. See docs/dimensions-mix.md and LICENCES.md.
 */
const media: TemplateMix["media"] = {
  "mix-01": clip(1),
  "mix-02": clip(2),
  "mix-03": clip(3),
  "mix-track": {
    kind: "audio",
    url: `${DIR}/mix-track.wav`,
    path: "media/mix-track.wav",
    durationSeconds: 23.2,
  },
};

/**
 * The first mix template (29 October 2026): a 23-second Supernatural
 * Creatures teaser cut from three bundled clips to the owner's track at 140
 * BPM, with the Signal look on top (screen open, build panels naming each
 * creature, a wireframe scan, impact slams, slice glitches, a beat HUD) and
 * an end card. Nothing is generated: `run: "mix"`. One optional step
 * follows the render: upscaling it with SeedVR2, the open upscaler, which the
 * person opts into and confirms like any run.
 */
export const dimensionsMix: HouseTemplate = {
  id: "dimensions-mix",
  name: "Dimensions mix",
  run: "mix",
  description:
    "Three creatures cut to the beat with Signal overlays: a finished teaser, nothing to generate.",
  tier: "open",
  style: {
    name: "Signal",
    look: "Bundled creature clips cut on the bar, with the Signal construction theme's panels, scan and readouts.",
    lighting:
      "The clips' own light; the overlays add lime glows and white slams.",
    palette:
      "Signal black, paper, lime and white over the clips' pink and ember.",
    swatches: [
      { name: "Signal", hex: "#0c0e0c" },
      { name: "Paper", hex: "#eaf2df" },
      { name: "Lime", hex: "#d5ff70" },
      { name: "White", hex: "#f6f8f2" },
    ],
    negativeSpace:
      "The HUD keeps to the frame's edges; captions sit beside the creature, never over it.",
  },
  inputs: {
    subject: {
      label: "Piece",
      hint: "What the cut shows.",
      default: "three supernatural creatures, cut to Dimensions",
    },
    title: {
      label: "Title",
      hint: "The slam on the biggest hit.",
      default: "SUPERNATURAL / CREATURES",
    },
    aspects: ["16:9"],
  },
  references: [],
  shots: [],
  tracks: [],
  examples: [
    {
      id: "dimensions-mix",
      video: "/media/template-gallery/dimensions-mix.mp4",
      poster: "/media/template-gallery/dimensions-mix.jpg",
      aspect: "16:9",
      inputs: {
        subject: "three supernatural creatures, cut to Dimensions",
        title: "SUPERNATURAL / CREATURES",
        aspect: "16:9",
      },
    },
  ],
  mix: {
    cut: cut as unknown as MixSpec,
    media,
    // After the 1920 × 1080 cut is rendered, the person may ask for 2×
    // on the open upscaler. Opt-in, quoted and
    // confirmed like any run; the tier stays Open. docs/seedvr2-upscale.md.
    upscale: { entry: "seedvr2-upscale", factor: 2, optIn: true },
  },
};
