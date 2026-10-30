/**
 * MiniMax H3's camera wording, for every H3 entry: H3 on Router and the four
 * Cloud OmniRef workflows. The motion types and their placement come from
 * MiniMax's base prompt guide, section 4.3 (Camera Motion: Motion Type +
 * Amplitude + Speed), pinned below and rechecked on 27 October 2026; the
 * full-reference guide (section 5.1) defers to it. A move is written "as a
 * natural English action within the shot", never as a bracket command. No
 * amplitude or speed modifier is written: the guide says the medium, normal
 * default is usually omitted. Shot sizes and angles have no H3 list, so their
 * sentences are the studio's, with stationary verbs as the LTX ones have,
 * for the composition that opens a shot (section 4.1). Mapping and sources:
 * docs/minimax-h3-camera.md. No claim about how H3 follows a term comes from
 * here.
 */
import type { CameraSectionId, CameraTermId } from "./camera-terms";
import type { VideoModel } from "./types";

/** MiniMax's base prompt guide, at the commit the studio checked. */
export const H3_GUIDE_URL =
  "https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md";

/** Every entry that runs H3 and takes the camera. The Openjutsu swap does not. */
export const H3_CAMERA_MODELS: readonly VideoModel[] = [
  "minimax-h3-router",
  "minimax-h3",
  "minimax-h3-canny",
  "minimax-h3-depth",
  "minimax-h3-combined",
];
export const isH3CameraModel = (model: VideoModel | undefined) =>
  model !== undefined && H3_CAMERA_MODELS.includes(model);

/**
 * The guide section each panel section links to: the opening composition
 * (4.1) for shot size and angle, the motion table (4.3) for movement.
 */
export const H3_GUIDE_ANCHORS: Record<CameraSectionId, string> = {
  "shot-sizes": "41-develop-the-multimodal-description-along-the-timeline",
  angles: "41-develop-the-multimodal-description-along-the-timeline",
  movements: "43-camera-motion-motion-type--amplitude--speed",
};

interface H3Term {
  /** The guide's name for the move; absent keeps the studio's label. */
  name?: string;
  /** The sentence the prompt carries. */
  h3: string;
}

/**
 * The terms the H3 panel shows, in its order: shot sizes and angles as the
 * LTX panel narrows them, then the moves in the guide's table order (Push In /
 * Pull Out, Pan, Truck, Tilt, Pedestal, Arc Shot, Tracking Shot, Static Shot,
 * Shake). Orbit (no full circle is documented), the undirected Pan and
 * Trucking, and Lazy Susan (a subject move) are left out.
 */
export const H3_TERMS = {
  "extreme-close-up": {
    h3: "An extreme close-up fills the frame with one detail of the subject.",
  },
  "close-up": { h3: "A close-up frames the upper part of the subject." },
  medium: { h3: "A medium shot frames the subject from the waist upward." },
  full: { h3: "A full shot keeps the whole subject in the frame." },
  wide: { h3: "A wide shot gives the subject room in its surroundings." },
  establishing: {
    h3: "A wide establishing shot shows the subject and the whole setting around it.",
  },
  "eye-level": { h3: "The camera sits at eye level with the subject." },
  "low-angle": { h3: "The camera looks up at the subject from a low angle." },
  "high-angle": {
    h3: "The camera looks down at the subject from a high angle.",
  },
  "birds-eye": {
    name: "Overhead view",
    h3: "An overhead view looks straight down at the subject from directly above.",
  },
  "dolly-in": {
    name: "Push in",
    h3: "The camera pushes in toward the subject.",
  },
  "pull-back": {
    name: "Pull out",
    h3: "The camera pulls out from the subject.",
  },
  "pan-left": { h3: "The camera pans left across the subject." },
  "pan-right": { h3: "The camera pans right across the subject." },
  "dolly-left": {
    name: "Truck left",
    h3: "The camera trucks left past the subject.",
  },
  "dolly-right": {
    name: "Truck right",
    h3: "The camera trucks right past the subject.",
  },
  tilt: { name: "Tilt up", h3: "The camera tilts up along the subject." },
  // Pedestal moves the whole camera straight up or down: the nearest
  // documented move to a crane or jib.
  crane: {
    name: "Pedestal up",
    h3: "The camera pedestals up, keeping the subject in view.",
  },
  "jib-down": {
    name: "Pedestal down",
    h3: "The camera pedestals down toward the subject's level.",
  },
  arc: { h3: "The camera moves in an arc around the subject." },
  follow: {
    name: "Tracking shot",
    h3: "A tracking shot follows the subject as it moves.",
  },
  static: {
    name: "Static shot",
    h3: "The camera holds a static shot on the subject.",
  },
  // "Handheld" is not in the table; Shake Slightly is the nearest move.
  handheld: {
    name: "Shake slightly",
    h3: "The camera shakes slightly as it stays on the subject.",
  },
} as const satisfies Partial<Record<CameraTermId, H3Term>>;

const H3_ORDER: readonly string[] = Object.keys(H3_TERMS);
const h3Term = (id: CameraTermId): H3Term | undefined =>
  (H3_TERMS as Partial<Record<CameraTermId, H3Term>>)[id];

/** H3's sentence for a term, or undefined when the H3 panel leaves it out. */
export const h3Sentence = (id: CameraTermId) => h3Term(id)?.h3;
/** The guide's name for a term, or undefined to keep the studio's label. */
export const h3Name = (id: CameraTermId) => h3Term(id)?.name;
/** Sorts terms into the H3 panel's order. */
export const byH3Order = (a: { id: string }, b: { id: string }) =>
  H3_ORDER.indexOf(a.id) - H3_ORDER.indexOf(b.id);

/**
 * The prompt in H3's order (base guide 4.1 and 4.3, full-reference guide
 * 5.1): the composition that opens the shot (shot size, then angle), the
 * person's text, then the camera move in the same shot, as one paragraph.
 * Empty parts are left out; nothing is bracketed and no Ref2VA section is
 * written.
 */
export const h3Paragraph = (parts: {
  shot: string;
  angle: string;
  main: string;
  movement: string;
}) =>
  [parts.shot, parts.angle, parts.main, parts.movement]
    .filter(Boolean)
    .join(" ");
