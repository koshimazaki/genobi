import cut from "./genobi-teaser.cut.json";
import type { MixSpec } from "./mix";
import type { HouseTemplate, TemplateMix } from "./types";

const DIR = "/media/director-templates/genobi-teaser" as const;
type Media = TemplateMix["media"][string];
const video = (url: `/${string}`, path: string, seconds: number): Media => ({
  kind: "video",
  url,
  path: `media/${path}`,
  durationSeconds: seconds,
});
/**
 * Upscaled generations, as drop-in replacements: put the owner's upscaled
 * file at `public/media/director-templates/genobi-teaser/gen/<asset id>.mp4`
 * (same duration and frame rate, any resolution), add the id here and
 * re-render (docs/genobi-teaser.md#upscaled-generations). The cut does not
 * change; the slice is scaled from whatever resolution the file has.
 */
export const UPSCALED: readonly string[] = [];
const generation = (
  id: string,
  url: `/${string}`,
  path: string,
  seconds: number,
): Media =>
  UPSCALED.includes(id)
    ? video(`${DIR}/gen/${id}.mp4`, `gen-${id}.mp4`, seconds)
    : video(url, path, seconds);
const footage = (name: string, seconds: number) =>
  video(`${DIR}/${name}.mp4`, `${name}.mp4`, seconds);

/**
 * The bundled media: eleven silent 3840 × 2160, 24 fps recordings of the
 * studio (and of Genobi's nodes in ComfyUI) driven in a browser (`scripts/capture-genobi-teaser.mjs`; nothing
 * generated, nothing spent), the owner's generations (the forest guardian
 * preview, a FLUX 3 image-to-video run, the Dimensions mix clips, and since version 3
 * short excerpts of the owner's upscaled MiniMax H3 creature clips and of
 * the upscaled Dimensions mix; no realistic footage), and the owner's track "Trailer-Genobi",
 * whole, behind 37 ms of silence so its first downbeat lands on beat 4, at
 * -14 LUFS. Cursor, clicks, zooms, focus boxes, loaders and titles are
 * layers in the cut, not pixels in the footage. See docs/genobi-teaser.md.
 */
const media: TemplateMix["media"] = {
  "ui-gallery": footage("ui-gallery", 12),
  "ui-camera": footage("ui-camera", 13.792),
  "ui-camera-control": footage("ui-camera-control", 11),
  "ui-director": footage("ui-director", 10.333),
  "ui-comfy": footage("ui-comfy", 10),
  "ui-editor": footage("ui-editor", 15),
  "ui-timeline": footage("ui-timeline", 8.292),
  "ui-directions": footage("ui-directions", 10.292),
  "ui-world": footage("ui-world", 14),
  "ui-swords": footage("ui-swords", 8.625),
  "ui-scrolls": footage("ui-scrolls", 9.167),
  "ui-agent": footage("ui-agent", 8.042),
  "ui-licences": footage("ui-licences", 9.083),
  "ui-save": footage("ui-save", 9),
  character: generation(
    "character",
    "/media/template-gallery/character-piece.mp4",
    "character-piece.mp4",
    20.041,
  ),
  "mix-01": generation(
    "mix-01",
    "/media/director-templates/dimensions-mix/mix-01.mp4",
    "mix-01.mp4",
    13.5,
  ),
  "mix-02": generation(
    "mix-02",
    "/media/director-templates/dimensions-mix/mix-02.mp4",
    "mix-02.mp4",
    13.5,
  ),
  "mix-03": generation(
    "mix-03",
    "/media/director-templates/dimensions-mix/mix-03.mp4",
    "mix-03.mp4",
    13.5,
  ),
  // The owner's MiniMax H3 (open weights) creature clips, upscaled by the
  // owner, 30 October 2026: the few seconds the cut plays of each, at
  // 1920 × 1080 (docs/genobi-teaser.md#version-3-creatures).
  "creature-01": footage("creature-training-01", 2.5),
  "creature-02": footage("creature-training-02", 2.5),
  "creature-03": footage("creature-training-03", 2.5),
  "creature-04": footage("creature-training-04", 3),
  "creature-05": footage("creature-training-05", 2.5),
  "creature-transform": footage("creature-transformation-01", 3),
  // Four seconds of the upscaled Dimensions mix render.
  "dimensions-excerpt": footage("dimensions-mix-excerpt", 4),
  "teaser-track": {
    kind: "audio",
    url: `${DIR}/teaser-track.mp3`,
    path: "media/teaser-track.mp3",
    durationSeconds: 119.59,
  },
};

/**
 * The Genobi teaser (30 October 2026): two minutes of the studio in use, cut
 * to the owner's track at 135 BPM. Studio footage walks Gallery, Camera, the
 * Director and Editor, the 3D World Builder, Dual Swords, Scrolls and the
 * Genobi agent; the owner's generations land on the drops. Titles, a
 * loader and picture reveals run free Transitions.dev transitions unchanged
 * (`gen-title`, `gen-status`, `gen-image`); the pointer, focus boxes, camera
 * moves and wipes are Genobi recipes; the end card is the construction
 * effect. Nothing is generated: `run: "mix"`.
 */
export const genobiTeaser: HouseTemplate = {
  id: "genobi-teaser",
  name: "Genobi teaser",
  run: "mix",
  description:
    "Two minutes of the studio in use, cut to the beat with generated titles and reveals: studio screen recordings, with the owner's MiniMax H3 (open weights) creature clips and a FLUX 3 (API) forest guardian. Nothing to generate.",
  tier: "open",
  style: {
    name: "Signal",
    look: "Studio screen recordings with a pointer, focus boxes and camera moves, the owner's MiniMax H3 creatures and FLUX 3 forest guardian on the drops, Signal titles and wipes.",
    lighting: "The studio's own dark interface; the generations' own light.",
    palette: "Signal black, paper and lime over the interface and the clips.",
    swatches: [
      { name: "Signal", hex: "#0c0e0c" },
      { name: "Paper", hex: "#eaf2df" },
      { name: "Lime", hex: "#d5ff70" },
      { name: "White", hex: "#f6f8f2" },
    ],
    negativeSpace:
      "Focus boxes dim the rest of the interface; titles hold the frame alone.",
  },
  inputs: {
    subject: {
      label: "Piece",
      hint: "What the cut shows.",
      default: "Genobi in use, cut to Trailer-Genobi",
    },
    title: {
      label: "Title",
      hint: "The generated title at the open.",
      default: "GENOBI",
    },
    aspects: ["16:9"],
  },
  references: [],
  shots: [],
  tracks: [],
  examples: [
    {
      id: "genobi-teaser",
      video: "/media/template-gallery/genobi-teaser.mp4",
      poster: "/media/template-gallery/genobi-teaser.jpg",
      aspect: "16:9",
      inputs: {
        subject: "Genobi in use, cut to Trailer-Genobi",
        title: "GENOBI",
        aspect: "16:9",
      },
    },
  ],
  mix: { cut: cut as unknown as MixSpec, media },
};
