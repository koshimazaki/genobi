import cut from "./audio-reactive-drop.cut.json";
import type { MixSpec } from "./mix";
import type { HouseTemplate, TemplateMix } from "./types";

const DIR = "/media/director-templates/audio-reactive-drop" as const;

/**
 * The five rooms in cut order, each its own shot over its own file, with the
 * room sound measured from its capture's room-sound.json receipt (the
 * browser shoebox engine, docs/world-builder-dynamic-sound.md): the
 * acoustic width range in metres and the Sabine RT60 range in seconds. The
 * RT60s are the model's, not measurements of the render. `seconds` is where
 * the room plays in the cut (frames 0 / 174 / 342 / 511 / 679 / 776). The
 * towers' street proxy and the nave proxy follow the measured gap of their
 * side rows (scripts/experiments/recipes-clap.ts), and the bundled track
 * carries those re-captures (docs/audio-reactive-drop.md). The pyramid
 * outside is open air: no room is modelled for it. The studio's picture is
 * the singer from the original Adaptive reverb take, turning to the camera;
 * its width and RT60 are the booth capture's, whose room sound the track
 * carries under it. The singer clip itself was not measured.
 */
export const DROP_ROOMS = [
  {
    room: "towers",
    asset: "drop-towers",
    seconds: [0, 7.25],
    width: [5.7, 22.4],
    rt60: [2.1, 5.46],
  },
  {
    room: "cathedral",
    asset: "drop-cathedral",
    seconds: [7.25, 14.25],
    width: [7, 20.4],
    rt60: [2.01, 3.48],
  },
  {
    room: "pyramid inside",
    asset: "drop-pyramid-inside",
    seconds: [14.25, 21.292],
    width: [9.6, 29.4],
    rt60: [1.54, 3.13],
  },
  {
    room: "pyramid outside",
    asset: "drop-pyramid-outside",
    seconds: [21.292, 28.292],
    width: null,
    rt60: null,
  },
  {
    room: "studio",
    asset: "drop-studio",
    seconds: [28.292, 32.333],
    width: [1.0, 3.0],
    rt60: [0.2, 0.34],
  },
] as const;

const video = (id: string, durationSeconds: number) => ({
  kind: "video" as const,
  url: `${DIR}/${id}.mp4` as const,
  path: `media/${id}.mp4`,
  durationSeconds,
});

/**
 * The bundled media: four rooms cut from the assembled picture (hologram,
 * dancer heatmap and the cathedral's floor pulse baked in) at their own first
 * frame for exactly their shot, 1920 × 1080, CRF 18, no sound; the studio,
 * the last 97 frames of the original Adaptive reverb take (the singer turning
 * to the camera) upscaled once to 1920 × 1080; the booth's LTX render, the
 * studio's earlier picture, listed so it swaps back; the two pyramid rooms
 * again without the hologram passes, so the hologram is a swap; and the
 * track, "Adaptive Reverb v2" with each room's dynamic per-frame room sound
 * at wet 0.45 under the dry track, MP3 320 kb/s (32.341 s of audio).
 * Replacing the track is one file and its `durationSeconds`.
 */
const media: TemplateMix["media"] = {
  "drop-towers": video("drop-towers", 7.25),
  "drop-cathedral": video("drop-cathedral", 7),
  "drop-pyramid-inside": video("drop-pyramid-inside", 7.041667),
  "drop-pyramid-outside": video("drop-pyramid-outside", 7),
  "drop-studio": video("drop-studio", 4.041667),
  "drop-studio-booth": video("drop-studio-booth", 4.041667),
  "drop-pyramid-inside-plain": video("drop-pyramid-inside-plain", 7.041667),
  "drop-pyramid-outside-plain": video("drop-pyramid-outside-plain", 7),
  "drop-track": {
    kind: "audio",
    url: `${DIR}/drop-track.mp3`,
    path: "media/drop-track.mp3",
    durationSeconds: 32.341,
  },
};

/**
 * Acoustic Spaces v2 (3 November 2026): the 3D + LTX template, version two
 * of Adaptive reverb. Five World Builder rooms rendered by LTX-2.5
 * Layout-to-Render on the owner's track "Adaptive Reverb v2", each with its
 * own CPU room sound under its section, cut on the phrases: towers, a
 * cathedral, inside and outside a pyramid, then a small studio where the
 * original take's singer turns to the camera and the credit is traced in
 * beside her. Every room is its own shot and file and every overlay its own
 * layer, so any of them swaps in the Editor. Nothing is generated:
 * `run: "mix"`. See docs/audio-reactive-drop.md.
 */
export const audioReactiveDrop: HouseTemplate = {
  id: "audio-reactive-drop",
  name: "Acoustic Spaces v2",
  run: "mix",
  description:
    "The 3D + LTX template, version two: five World Builder 3D rooms rendered by LTX-2.5 (open weights) on one track, each room's own CPU room sound under it. Every room, the track and every overlay is a layer to swap.",
  tier: "open",
  style: {
    name: "Reactive spaces",
    look: "The rooms' own light under a gentle CRT visor, a REC HUD per room, wireframe sweeps, traced titles and RT60 readouts.",
    lighting:
      "The renders' own light; the overlays add cyan and amber readouts.",
    palette: "Near black, cyan and amber, with white readouts.",
    swatches: [
      { name: "Night", hex: "#0b0d0c" },
      { name: "Cyan", hex: "#62f2e4" },
      { name: "Amber", hex: "#f2b84b" },
      { name: "White", hex: "#f6f8f2" },
    ],
    negativeSpace:
      "Readouts keep to the frame's edges and change sides room by room; the focus boxes frame the nave and the dancer.",
  },
  inputs: {
    subject: {
      label: "Piece",
      hint: "What the cut shows.",
      default: "Five rooms on one track, each room's sound changing with it",
    },
    title: {
      label: "Title",
      hint: "The credit traced in beside the singer.",
      default: "REACTIVE SPACES",
    },
    aspects: ["16:9"],
  },
  references: [],
  shots: [],
  tracks: [],
  examples: [
    {
      id: "audio-reactive-drop",
      video: "/media/template-gallery/audio-reactive-drop.mp4",
      poster: "/media/template-gallery/audio-reactive-drop.jpg",
      aspect: "16:9",
      inputs: {
        subject: "Five rooms on one track, each room's sound changing with it",
        title: "REACTIVE SPACES",
        aspect: "16:9",
      },
    },
  ],
  mix: { cut: cut as unknown as MixSpec, media },
};
