/**
 * The camera vocabulary: every term the panel can show, with one wording per
 * model family. FLUX 3 clauses follow BFL's camera guide; LTX-2.5 sentences
 * follow the LTX-2.5 prompt guide (one flowing present-tense paragraph, the
 * camera described relative to the subject, and how the subject appears after
 * the move); MiniMax H3's sentences live in `camera-h3.ts`, from MiniMax's
 * prompt guide. Examples are authored for this studio. Each model sees only
 * the moves its own sources name: LTX gets its camera presets (dolly in, out,
 * left, right; jib up, down; static) and the LTX-2.5 guide's verbs; FLUX keeps
 * BFL's Arc shot, Trucking and Lazy Susan; H3 gets the motion types its guide
 * lists, Pan split by direction. LTX and H3 get a shorter list of shot sizes
 * and angles: overlapping or contradicting terms stay with FLUX. The panel
 * looks the same for every model; `camera.ts` picks names and wording.
 */
import { H3_CAMERA_MODELS } from "./camera-h3";
import type { VideoModel } from "./types";
export type Motion =
  | "orbit"
  | "arc"
  | "dolly"
  | "pan"
  | "tilt"
  | "crane"
  | "truck"
  | "subject"
  | "handheld";
export interface PoseSettings {
  distance?: number;
  targetY?: number;
  elevation?: number;
  azimuth?: number;
  roll?: number;
  motion?: Motion;
  amount?: number;
}
export interface TermSpec {
  id: string;
  label: string;
  description: string;
  /** FLUX 3 wording, from the BFL camera guide. */
  clause: string;
  /** LTX-2.5 wording, from the LTX-2.5 prompt guide: a present-tense sentence relative to the subject. */
  ltx: string;
  example: string;
  pose: PoseSettings;
  /** Absent means every model; set for terms only one guide names. */
  models?: readonly VideoModel[];
}
export const EXAMPLE_SCENE =
  "A chrome chair stands on a circular plinth in a quiet gallery.";
const term = <T extends string>(
  id: T,
  label: string,
  description: string,
  clause: string,
  ltx: string,
  pose: PoseSettings,
  models?: readonly VideoModel[],
) => ({
  id,
  label,
  description,
  clause,
  ltx,
  pose,
  example: `${EXAMPLE_SCENE} ${clause}`,
  ...(models ? { models } : {}),
});
export const LTX_MODELS: readonly VideoModel[] = [
  "ltx-2.5",
  "ltx-2.5-pro",
  "ltx-2.5-open",
  "ltx-2.5-akuspace",
];
/**
 * FLUX 3 video, from text or from a start image: BFL's camera guide names
 * no limit for image-to-video, so both get every BFL move.
 */
const FLUX_MODELS: readonly VideoModel[] = ["flux-3", "flux-3-i2v"];
/** FLUX 3 video and the Klein stills: terms LTX leaves out. */
const NOT_LTX: readonly VideoModel[] = [
  ...FLUX_MODELS,
  "flux-3-klein",
  "flux-3-klein-api",
];

export const cameraSections = [
  {
    id: "shot-sizes",
    label: "Shot sizes",
    heading: "Shot sizes and framing",
    anchor: "shot-sizes-and-framing",
    color: "--camera-shot",
    glyph: "frame",
    terms: [
      term(
        "macro",
        "Macro",
        "Explore a tiny surface detail.",
        "Macro detail of the subject's surface.",
        "A macro shot shows a tiny surface detail of the subject, filling the frame.",
        { distance: 0.65, targetY: 1.3 },
        // Overlaps Extreme close-up; the LTX guide names neither macro nor a lens.
        NOT_LTX,
      ),
      term(
        "extreme-close-up",
        "Extreme close-up",
        "Fill the frame with one detail.",
        "Extreme close-up on a single detail of the subject.",
        "An extreme close-up fills the frame with one detail of the subject.",
        { distance: 0.95, targetY: 1.5 },
      ),
      term(
        "close-up",
        "Close-up",
        "Concentrate on the upper part of the subject.",
        "Close-up of the subject.",
        "A close-up frames the upper part of the subject.",
        { distance: 1.3, targetY: 1.4 },
      ),
      term(
        "medium",
        "Medium shot",
        "Frame roughly from the waist upward.",
        "Medium shot of the subject.",
        "A medium shot frames the subject from the waist upward.",
        { distance: 1.8, targetY: 1.2 },
      ),
      term(
        "cowboy",
        "Cowboy shot",
        "Frame from mid-thigh upward.",
        "Cowboy shot of the subject.",
        "A cowboy shot frames the subject from mid-thigh upward.",
        { distance: 2.2, targetY: 1.1 },
        // Sits between Medium and Full; LTX keeps the guide's broader scales.
        NOT_LTX,
      ),
      term(
        "full",
        "Full shot",
        "Keep the entire subject in the frame.",
        "Full shot of the subject.",
        "A full shot keeps the whole subject in the frame.",
        { distance: 2.7, targetY: 0.9 },
      ),
      term(
        "wide",
        "Wide shot",
        "Give the subject room in its surroundings.",
        "Wide shot with space around the subject.",
        "A wide shot gives the subject room in its surroundings.",
        { distance: 3.8, targetY: 0.9 },
      ),
      term(
        "establishing",
        "Establishing shot",
        "Introduce the setting around the subject.",
        "Establishing shot of the subject within its surroundings.",
        "A wide establishing shot shows the subject and the whole setting around it.",
        { distance: 5.2, targetY: 0.9 },
      ),
    ],
  },
  {
    id: "angles",
    label: "Angles",
    heading: "Camera angles",
    anchor: "camera-angles",
    color: "--camera-angle",
    glyph: "angle",
    terms: [
      term(
        "eye-level",
        "Eye level",
        "Look straight toward the subject.",
        "Eye-level view of the subject.",
        "The camera sits at eye level with the subject.",
        { elevation: 0 },
      ),
      term(
        "low-angle",
        "Low angle",
        "Look upward from below.",
        "Low angle looking up at the subject.",
        "The camera looks up at the subject from a low angle.",
        { elevation: -18 },
      ),
      term(
        "high-angle",
        "High angle",
        "Look down from above.",
        "High angle looking down at the subject.",
        "The camera looks down at the subject from a high angle.",
        { elevation: 35 },
      ),
      term(
        "birds-eye",
        "Bird's eye",
        "Look almost straight down.",
        "Bird's eye view directly above the subject.",
        "An overhead view looks straight down at the subject from directly above.",
        { elevation: 88 },
      ),
      term(
        "worms-eye",
        "Worm's eye",
        "Look up from near the ground.",
        "Worm's eye view from ground level.",
        "The camera looks up at the subject from ground level.",
        { elevation: -40 },
        // Overlaps Low angle; LTX keeps the one upward view.
        NOT_LTX,
      ),
      term(
        "aerial",
        "Aerial",
        "Look down from a raised, oblique position.",
        "Aerial view above the subject and its surroundings.",
        "An aerial view looks down at the subject and its surroundings from above.",
        { elevation: 55 },
        // Sits between High angle and the guide's Overhead view.
        NOT_LTX,
      ),
      term(
        "dutch",
        "Dutch angle",
        "Tilt the horizon within the frame.",
        "Dutch angle with a tilted horizon.",
        "The frame sits at a Dutch angle, the horizon leaning across the shot.",
        { elevation: 0, roll: 22 },
        // Not in the LTX guide, and a rolled frame reads as a move beside one.
        NOT_LTX,
      ),
      term(
        "profile",
        "Profile shot",
        "Look at the subject from the side.",
        "Profile shot from the side of the subject.",
        "The camera views the subject in profile, from the side.",
        { elevation: 0, azimuth: 90 },
      ),
    ],
  },
  {
    id: "movements",
    label: "Movements",
    heading: "Camera movements",
    anchor: "camera-movements",
    color: "--camera-movement",
    glyph: "motion",
    terms: [
      term(
        "orbit",
        "Orbit",
        "Circle around the subject.",
        "Slow orbit around the subject.",
        "The camera circles slowly around the subject. At the end the subject faces the camera from the other side.",
        { motion: "orbit", amount: 360 },
      ),
      term(
        "arc",
        "Arc shot",
        "Sweep through part of a circle.",
        "Arc shot around the subject.",
        "The camera sweeps in an arc around the subject, settling on its far side.",
        { motion: "arc", amount: 65 },
        FLUX_MODELS,
      ),
      term(
        "dolly-in",
        "Dolly in",
        "Move the camera toward the subject.",
        "Dolly in toward the subject.",
        "The camera pushes in toward the subject. At the end the subject fills the frame.",
        { motion: "dolly", amount: -0.35 },
      ),
      term(
        "pan",
        "Pan",
        "Turn horizontally from a fixed position.",
        "Pan slowly across the subject.",
        "The camera pans across the subject from a fixed position, the subject passing through the frame.",
        { motion: "pan", amount: 0.8 },
      ),
      // H3's guide names Pan Left and Pan Right, never an undirected pan, so
      // H3 gets these two in place of Pan; FLUX and LTX keep the one Pan.
      term(
        "pan-left",
        "Pan left",
        "Turn left from a fixed position.",
        "Pan left across the subject.",
        "The camera pans left across the subject from a fixed position.",
        { motion: "pan", amount: -0.8 },
        H3_CAMERA_MODELS,
      ),
      term(
        "pan-right",
        "Pan right",
        "Turn right from a fixed position.",
        "Pan right across the subject.",
        "The camera pans right across the subject from a fixed position.",
        { motion: "pan", amount: 0.8 },
        H3_CAMERA_MODELS,
      ),
      term(
        "tilt",
        "Tilt",
        "Turn vertically from a fixed position.",
        "Tilt slowly upward along the subject.",
        "The camera tilts upward along the subject from a fixed position, ending on its top.",
        { motion: "tilt", amount: 0.7 },
      ),
      term(
        "crane",
        "Crane / boom",
        "Lift the camera while keeping the subject in view.",
        "Crane / boom shot rising above the subject.",
        "The camera rises above the subject, keeping it in view as the ground falls away.",
        { motion: "crane", amount: 1.7 },
      ),
      term(
        "trucking",
        "Trucking",
        "Move the camera sideways across the scene.",
        "Trucking shot moving sideways past the subject.",
        "The camera tracks sideways past the subject, which stays in frame as the background slides by.",
        { motion: "truck", amount: 1.8 },
        FLUX_MODELS,
      ),
      term(
        "lazy-susan",
        "Lazy Susan",
        "Rotate the subject while the camera stays still.",
        "Lazy Susan rotation of the subject on a turntable.",
        "The camera holds a static frame while the subject turns slowly in place, showing every side.",
        { motion: "subject", amount: 360 },
        FLUX_MODELS,
      ),
      term(
        "pull-back",
        "Pull back",
        "Move the camera away from the subject.",
        "Dolly out away from the subject.",
        "The camera pulls back from the subject. At the end the subject sits small in a wider frame.",
        { motion: "dolly", amount: 0.5 },
        LTX_MODELS,
      ),
      // LTX's camera presets name the direction; the sentence describes what
      // the move reveals, as the LTX-2 camera LoRA cards advise.
      term(
        "dolly-left",
        "Dolly left",
        "Move the camera sideways to the left.",
        "Trucking shot moving left past the subject.",
        "The camera tracks left past the subject, revealing the space to its left as the background slides by.",
        { motion: "truck", amount: -1.8 },
        LTX_MODELS,
      ),
      term(
        "dolly-right",
        "Dolly right",
        "Move the camera sideways to the right.",
        "Trucking shot moving right past the subject.",
        "The camera tracks right past the subject, revealing the space to its right as the background slides by.",
        { motion: "truck", amount: 1.8 },
        LTX_MODELS,
      ),
      term(
        "jib-down",
        "Jib down",
        "Lower the camera while keeping the subject in view.",
        "Crane / boom shot descending toward the subject.",
        "The camera descends toward the subject, the ground around it coming into view as the shot settles at its level.",
        { elevation: 35, motion: "crane", amount: -1.6 },
        LTX_MODELS,
      ),
      term(
        "follow",
        "Follow",
        "Move with the subject as it moves.",
        "Steadicam follow shot tracking the subject.",
        "The camera follows the subject as it moves, keeping it centred while the scene passes by.",
        { motion: "truck", amount: 1.4 },
        // Needs a moving subject, which a scene cannot promise; FLUX keeps it.
        NOT_LTX,
      ),
      term(
        "handheld",
        "Handheld",
        "Hold the frame by hand, with a slight natural sway.",
        "Handheld camera with loose, organic movement.",
        "Handheld movement sways the frame slightly as the camera stays on the subject.",
        { motion: "handheld", amount: 0.06 },
      ),
      term(
        "static",
        "Static",
        "Lock the camera on one frame.",
        "Static camera, no movement.",
        "The camera holds a static frame on the subject for the whole shot.",
        {},
        LTX_MODELS,
      ),
    ],
  },
] as const;

export type CameraSection = (typeof cameraSections)[number];
export type CameraSectionId = CameraSection["id"];
export type CameraTermId = CameraSection["terms"][number]["id"];
export type CameraTerm = TermSpec & { id: CameraTermId };
