import cut from "./adaptive-reverb.cut.json";
import type { MixSpec } from "./mix";
import type { HouseTemplate, TemplateMix } from "./types";

const DIR = "/media/director-templates/adaptive-reverb" as const;

/**
 * The node diagram of the workflow the take came from, drawn from
 * workflows/world-builder-akuspace-ltx.json (not a screenshot of ComfyUI).
 */
export const REVERB_WORKFLOW_STILL = `${DIR}/reverb-workflow.jpg` as const;

/**
 * How to make a room again (recorded, not run: the template generates
 * nothing). The 3D route: a World Builder room set, measured by Acoustics
 * (Sabine RT60 to an AKUSPACE preset), rendered by LTX-2.5 (open weights)
 * with the AKUSPACE LoRA in workflows/world-builder-akuspace-ltx.json;
 * workflows/world-builder-layout-to-render.json is the layout-to-picture
 * route for the same set. Each room names the preset the owner gave it (30
 * October 2026) and that preset's trained decay from
 * shared/akuspace-presets.json; `set` is the World Builder example room in
 * custom_nodes/director_world_builder/examples/rooms/.
 */
export const REVERB_ROUTE = {
  workflow: "workflows/world-builder-akuspace-ltx.json",
  layoutWorkflow: "workflows/world-builder-layout-to-render.json",
  registry: "ltx-2-5-akuspace",
  rooms: [
    {
      room: "cathedral",
      seconds: [7.9, 15.9],
      preset: "cathedral",
      rt60: 4.8,
      set: "custom_nodes/director_world_builder/examples/rooms/cathedral.json",
    },
    {
      room: "crowded hall",
      seconds: [15.9, 22.5],
      preset: "medium_room",
      rt60: 1.9,
      set: "custom_nodes/director_world_builder/examples/rooms/medium_room.json",
    },
    {
      room: "small wooden studio",
      seconds: [22.5, 30.46],
      preset: "small_room",
      rt60: 0.67,
      set: "custom_nodes/director_world_builder/examples/rooms/small_room.json",
    },
  ],
} as const;

/**
 * The bundled media: the owner's LTX-2.5 (open weights) + AKUSPACE LoRA
 * take (adaptive-reverb-v5-cpu, 30 October 2026), 30.46 s at 24 fps,
 * encoded once at its native 1280 × 720 (CRF 18, no sound); its own sound,
 * 30.65 s, re-encoded once from AAC to MP3 320 kb/s as the track and
 * otherwise unchanged; a frame of the studio for the end card; and the
 * workflow's node diagram.
 */
const media: TemplateMix["media"] = {
  "reverb-ltx": {
    kind: "video",
    url: `${DIR}/reverb-ltx.mp4`,
    path: "media/reverb-ltx.mp4",
    durationSeconds: 30.458,
  },
  "reverb-track": {
    kind: "audio",
    url: `${DIR}/reverb-track.mp3`,
    path: "media/reverb-track.mp3",
    durationSeconds: 30.65,
  },
};

/**
 * Adaptive reverb (30 October 2026): the 3D + LTX template. One LTX-2.5
 * (open weights) + AKUSPACE LoRA take drops between skyscrapers into a
 * cathedral, then a crowded hall, then a small wooden studio, and its own
 * sound changes with each room. The cut keeps that sound whole and adds a
 * room-scan surveillance look in the cathedral, wireframe sweeps and slice
 * glitches at the room changes, the workflow's node diagram before the
 * studio, and an editable end card. Nothing is generated: `run: "mix"`. See
 * docs/adaptive-reverb.md.
 */
export const adaptiveReverb: HouseTemplate = {
  id: "adaptive-reverb",
  name: "Adaptive reverb",
  run: "mix",
  description:
    "The 3D + LTX template: World Builder 3D rooms rendered by LTX-2.5 (open weights) with the AKUSPACE acoustics LoRA, so the sound changes with each room. Nothing to generate.",
  tier: "open",
  style: {
    name: "Room scan",
    look: "The take's own rooms under surveillance scanlines, a room-scan HUD, wireframe sweeps and RT60 readouts.",
    lighting: "The take's own light; the overlays add cyan and amber readouts.",
    palette: "Near black, cyan and amber, with white readouts.",
    swatches: [
      { name: "Night", hex: "#0b0d0c" },
      { name: "Cyan", hex: "#62f2e4" },
      { name: "Amber", hex: "#f2b84b" },
      { name: "White", hex: "#f6f8f2" },
    ],
    negativeSpace:
      "Readouts keep to the frame's edges; the measure box frames the nave.",
  },
  inputs: {
    subject: {
      label: "Piece",
      hint: "What the cut shows.",
      default:
        "One take through three rooms, its reverb changing with each room",
    },
    title: {
      label: "Title",
      hint: "The end card's title.",
      default: "ADAPTIVE REVERB",
    },
    aspects: ["16:9"],
  },
  references: [],
  shots: [],
  tracks: [],
  examples: [
    {
      id: "adaptive-reverb",
      video: "/media/template-gallery/adaptive-reverb.mp4",
      poster: "/media/template-gallery/adaptive-reverb.jpg",
      aspect: "16:9",
      inputs: {
        subject:
          "One take through three rooms, its reverb changing with each room",
        title: "ADAPTIVE REVERB",
        aspect: "16:9",
      },
    },
  ],
  mix: { cut: cut as unknown as MixSpec, media },
};
