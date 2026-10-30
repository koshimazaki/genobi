import cut from "./bloom-teaser.cut.json";
import type { MixSpec } from "./mix";
import type { HouseTemplate, TemplateMix } from "./types";

const DIR = "/media/director-templates/bloom-teaser" as const;
const clip = (name: "a" | "b") => ({
  kind: "video" as const,
  url: `${DIR}/bloom-h3-${name}.mp4` as const,
  path: `media/bloom-h3-${name}.mp4`,
  durationSeconds: 15.083,
});

/**
 * The character sheet (reference image) both clips were made from (`img1`
 * in the prompt). Its own origin is not recorded, so nothing names a model
 * for it or calls it open.
 */
export const BLOOM_SHEET = `${DIR}/bloom-sheet.jpg` as const;

/**
 * The prompt that made both clips, as the owner wrote it (30 October 2026),
 * with the character sheet as `img1`. Recorded, not run: the template
 * generates nothing.
 */
export const BLOOM_PROMPT =
  "animate each pose of this character sheet of <<<img1>>> , sequentially but as one smooth take, make it a starting point of cinematic advert. blosoming flowers are subtle. Wide angle lens, camera facing character. Starting from extereme close-up to full body shot. Fast pased, jumping and making ninja moves, with glowing and growing flowers mixed with cynernetic elements of the body of the characters. Include details featured on the <<<img1>>>";

/**
 * The bundled media: the owner's two MiniMax H3 (open weights) takes of the
 * Bloom character sheet, 15.08 s each at 24 fps, encoded once from 2560 ×
 * 1440 to 1920 × 1080 (CRF 18, no sound), and the owner's own track
 * "Anime-Genobi" (music by Koshimazaki, owner-made): 19.152 s as supplied, trimmed by
 * 40 ms so its first beat lands on frame 0, raised 3.7 dB to -14 LUFS and
 * kept at MP3 320 kb/s. Analysed at 139.86 BPM (cut at 140), first downbeat
 * on beat 3 (docs/bloom-teaser.md#the-track).
 */
const media: TemplateMix["media"] = {
  "bloom-h3-a": clip("a"),
  "bloom-h3-b": clip("b"),
  "bloom-track": {
    kind: "audio",
    url: `${DIR}/bloom-track.mp3`,
    path: "media/bloom-track.mp3",
    durationSeconds: 19.112,
  },
};

/**
 * Bloom (30 October 2026): a 19-second anime teaser of the owner's Bloom
 * character, cut from two MiniMax H3 (open weights) takes to the owner's track at 140
 * BPM,
 * in a character-scan and surveillance look. A Space.js scan of the
 * character sheet opens it, then the takes play under CRT scanlines, a REC /
 * CAM HUD, target boxes, callout panels, a helm scan and a wireframe sweep,
 * and the construction end card closes it with editable words. Nothing is
 * generated: `run: "mix"`. See docs/bloom-teaser.md.
 */
export const bloomTeaser: HouseTemplate = {
  id: "bloom-teaser",
  name: "Bloom",
  run: "mix",
  description:
    "An anime teaser for one character: two MiniMax H3 (open weights) takes cut to the beat under a character-scan, surveillance HUD. Nothing to generate.",
  tier: "open",
  style: {
    name: "Bloom scan",
    look: "The owner's MiniMax H3 takes of Bloom under CRT scanlines, a REC / CAM HUD, target boxes and callouts mapped from the character sheet.",
    lighting:
      "The takes' own forest and studio light; the overlays add cyan and magenta readouts.",
    palette:
      "Night black, magenta and cyan from the sheet, with white readouts.",
    swatches: [
      { name: "Night", hex: "#0b0a10" },
      { name: "Magenta", hex: "#ff5ad8" },
      { name: "Cyan", hex: "#62f2e4" },
      { name: "White", hex: "#f6f8f2" },
    ],
    negativeSpace:
      "The HUD keeps to the frame's edges; target boxes frame the figure, captions sit beside it.",
  },
  inputs: {
    subject: {
      label: "Piece",
      hint: "What the cut shows.",
      default: "Bloom, a flora-cybernetic ninja, scanned and cut to the beat",
    },
    title: {
      label: "Title",
      hint: "The end card's title.",
      default: "BLOOM",
    },
    aspects: ["16:9"],
  },
  references: [],
  shots: [],
  tracks: [],
  examples: [
    {
      id: "bloom-teaser",
      video: "/media/template-gallery/bloom-teaser.mp4",
      poster: "/media/template-gallery/bloom-teaser.jpg",
      aspect: "16:9",
      inputs: {
        subject: "Bloom, a flora-cybernetic ninja, scanned and cut to the beat",
        title: "BLOOM",
        aspect: "16:9",
      },
    },
  ],
  mix: { cut: cut as unknown as MixSpec, media },
};
