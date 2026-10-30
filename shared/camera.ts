/**
 * The camera panel for the chosen model: which terms it shows, what they are
 * called, which guide it links and the sentence each term writes. The terms
 * themselves live in `camera-terms.ts`, H3's wording in `camera-h3.ts`. FLUX
 * speaks BFL's guide, LTX the LTX-2.5 guide and LTX's camera presets, and every
 * H3 entry MiniMax's prompt guide; the panel looks the same for all three.
 */
import {
  cameraSections,
  EXAMPLE_SCENE,
  LTX_MODELS,
  type CameraSection,
  type CameraTerm,
  type CameraTermId,
} from "./camera-terms";
import {
  byH3Order,
  h3Name,
  h3Sentence,
  isH3CameraModel,
  H3_GUIDE_ANCHORS,
  H3_GUIDE_URL,
} from "./camera-h3";
import type { VideoModel } from "./types";
export {
  cameraSections,
  LTX_MODELS,
  type CameraSection,
  type CameraSectionId,
  type CameraTerm,
  type CameraTermId,
  type Motion,
  type PoseSettings,
} from "./camera-terms";
export { H3_GUIDE_URL, isH3CameraModel } from "./camera-h3";
export const CAMERA_GUIDE_URL =
  "https://docs.bfl.ai/guides/prompting_video_camera_terms";
export const LTX_GUIDE_URL = "https://ltx.io/blog/ltx-2-5-prompt-guide";
export const CAMERA_GUIDE_SECTION_COUNT = 14;

export type CameraSelection = {
  [S in CameraSection as S["id"]]: S["terms"][number]["id"] | null;
};
export type CameraEdits = Partial<Record<CameraTermId, string>>;
export const emptyCamera: CameraSelection = {
  "shot-sizes": null,
  angles: null,
  movements: null,
};
export const defaultCamera: CameraSelection = {
  ...emptyCamera,
  movements: "orbit",
};
export const cameraTerms: readonly CameraTerm[] = cameraSections.flatMap(
  (section) => [...section.terms],
);
/**
 * LTX's own names: its camera-control presets (dolly, jib, static) and the
 * LTX-2.5 prompt guide's verbs. Terms without one keep their label.
 */
const LTX_NAMES: Partial<Record<CameraTermId, string>> = {
  "birds-eye": "Overhead view",
  orbit: "Circle around",
  "dolly-in": "Dolly in",
  pan: "Pan across",
  tilt: "Tilt up",
  crane: "Jib up",
  "pull-back": "Dolly out",
};
export const isLtxModel = (model: VideoModel | undefined) =>
  model !== undefined &&
  (model.startsWith("ltx-deploy-") || LTX_MODELS.includes(model));
/** The name a term goes by in the chosen model's guide. */
export const termName = (term: CameraTerm, model: VideoModel = "flux-3") =>
  (isH3CameraModel(model) && h3Name(term.id)) ||
  (isLtxModel(model) && LTX_NAMES[term.id]) ||
  term.label;
/** The sentence a term writes for the chosen model, before any edit. */
function wording(term: CameraTerm, model: VideoModel) {
  if (isH3CameraModel(model)) return h3Sentence(term.id) ?? term.clause;
  return isLtxModel(model) ? term.ltx : term.clause;
}
const isMove = (term: CameraTerm) =>
  cameraSections.find((section) =>
    section.terms.some((item) => item.id === term.id),
  )?.id === "movements";
/**
 * The studio's example prompt, in the chosen model's wording. H3 opens a shot
 * with its composition, so a shot size or angle comes before the scene there.
 */
export function termExample(term: CameraTerm, model: VideoModel = "flux-3") {
  if (!isH3CameraModel(model) && !isLtxModel(model)) return term.example;
  const text = wording(term, model);
  return isH3CameraModel(model) && !isMove(term)
    ? `${text} ${EXAMPLE_SCENE}`
    : `${EXAMPLE_SCENE} ${text}`;
}
/** Which guide the panel links to for the chosen model, and its footnote. */
export function cameraGuide(model: VideoModel = "flux-3") {
  if (isH3CameraModel(model))
    return {
      name: "MiniMax H3 guide",
      url: H3_GUIDE_URL,
      anchored: true,
      note: "Camera motion from MiniMax's H3 prompt guide",
    };
  return isLtxModel(model)
    ? {
        name: "LTX guide",
        url: LTX_GUIDE_URL,
        anchored: false,
        note: "Camera language from the LTX guide and LTX's camera presets",
      }
    : {
        name: "BFL guide",
        url: CAMERA_GUIDE_URL,
        anchored: true,
        note: `${cameraSections.length} of ${CAMERA_GUIDE_SECTION_COUNT} sections from the BFL guide`,
      };
}
/** Where a section's heading links: the matching section of the model's guide. */
export function guideSectionUrl(
  section: CameraSection,
  model: VideoModel = "flux-3",
) {
  if (isH3CameraModel(model))
    return `${H3_GUIDE_URL}#${H3_GUIDE_ANCHORS[section.id]}`;
  const guide = cameraGuide(model);
  return guide.anchored ? `${guide.url}#${section.anchor}` : guide.url;
}
/**
 * The terms a model's guide names, in the panel's order: FLUX hides the
 * LTX-only moves, and H3 shows only the terms with an H3 sentence, in the
 * guide's order.
 */
export function termsFor(
  section: CameraSection,
  model: VideoModel = "flux-3",
): readonly CameraTerm[] {
  if (isH3CameraModel(model))
    return section.terms
      .filter((item: CameraTerm) => h3Sentence(item.id) !== undefined)
      .sort(byH3Order);
  return section.terms.filter(
    (item: CameraTerm) => item.models?.includes(model) ?? true,
  );
}
/**
 * A restored run carries its wording as an edit; text equal to any model's
 * default is not the person's own, so it follows the chosen model.
 */
const edited = (term: CameraTerm, text: string | undefined) =>
  text !== undefined &&
  text !== term.clause &&
  text !== term.ltx &&
  text !== h3Sentence(term.id);
/** The same selection written for the chosen model. A user's edit wins over any wording. */
export function cameraClauses(
  selection: CameraSelection,
  edits: CameraEdits = {},
  model: VideoModel = "flux-3",
) {
  // A term the chosen model's panel does not show is not written either.
  return cameraSections.flatMap((section) => {
    const selected = termsFor(section, model).find(
      (item) => item.id === selection[section.id],
    );
    return selected
      ? [
          {
            section,
            term: selected,
            text: edited(selected, edits[selected.id])
              ? edits[selected.id]!
              : wording(selected, model),
          },
        ]
      : [];
  });
}
export function cameraLabel(
  selection: CameraSelection,
  model: VideoModel = "flux-3",
) {
  return (
    cameraClauses(selection, {}, model)
      .map(({ term }) => termName(term, model))
      .join(" · ") || "No camera direction"
  );
}
