import type { HouseTemplate } from "./types";

/**
 * Falling room: the owner's generated loop (`docs/falling-room.md`). A brief
 * builds the World Builder's Falling room take (the Cathedral, an orbit60
 * shot, idle then hit then fall, 145 frames, with a dry sound made from the
 * recipe), one FLUX 3 Image Klein still is made from the brief with the
 * take's first frame as its reference when the project holds one, and the
 * take's WAV goes through Apply room into the room it was captured in. The
 * still is the one paid run; the take and the room are free. Nothing runs
 * when the template opens.
 */
export const fallingRoom: HouseTemplate = {
  id: "falling-room",
  name: "Falling room",
  run: "agent",
  description:
    "A figure falls in a cathedral: one Klein still, a free take, its room sound.",
  tier: "open",
  style: {
    name: "Nave light",
    look: "A vast stone cathedral nave with pale pews and bare walls, one figure on the floor of it.",
    lighting:
      "Cold high daylight from unseen clerestory windows, with long soft shadows across the floor.",
    palette:
      "A palette of bone, stone and dusk blue, with the figure the darkest shape in the frame.",
    swatches: [
      { name: "Bone", hex: "#e9e4d8" },
      { name: "Stone", hex: "#b9b2a3" },
      { name: "Dusk", hex: "#171e29" },
    ],
    negativeSpace: "The upper third stays empty vault, kept for the title.",
  },
  inputs: {
    subject: {
      label: "Brief",
      hint: "What happens in the room, in a sentence. One invented figure, never a real or famous person.",
      default:
        "a figure in a grey suit is struck by an unseen force and falls to the cathedral floor",
    },
    title: {
      label: "Title",
      hint: "Set in type over the still.",
      default: "FALLING ROOM",
    },
    // The take is 1024 × 576.
    aspects: ["16:9"],
  },
  references: [
    {
      id: "character",
      label: "Character sheet",
      kind: "image",
      role: "character",
      min: 0,
      max: 1,
      hint: "Optional: one invented character's sheet, which the still follows. Without one the mannequin stands in.",
      madeWith: "flux-3-klein-api",
    },
  ],
  shots: [
    {
      id: "still",
      label: "Still",
      entry: "flux-3-klein-api",
      length: { seconds: 2 },
      camera: { "shot-sizes": null, angles: null, movements: null },
      action:
        "{subject}, seen across the nave from where the first frame stands.",
      references: ["character"],
      firstFrameOf: "fall",
    },
  ],
  takes: [{ id: "fall", label: "Fall", take: "falling-room", frames: 145 }],
  tracks: [
    { kind: "take-sound", id: "room", name: "Room sound", take: "fall" },
    { kind: "shots", id: "shots", name: "Shots" },
    {
      kind: "type",
      id: "title",
      name: "Title",
      from: "still",
      size: 32,
      swatch: 0,
    },
  ],
  examples: [],
};
