import {
  isDeployModel,
  deployEndpoint,
} from "../shared/comfy/deploy-catalogue";
import {
  deployTemplates,
  deployValues,
} from "../shared/comfy/deploy-workflows";
import { isH3 } from "../shared/h3";
import { isH3Router } from "../shared/comfy/h3-router";
import {
  IMAGE_DESCRIPTION_LIMIT,
  imageEditing,
  isImage,
  isKlein,
} from "../shared/image";
import { entryFor } from "../shared/registry";
import { imagePrompt, regionBlocker } from "./image-regions";
import { ltxBlocked } from "./ltx-composer";
import { musicBlocked } from "./music-composer";
import type { ComposerState } from "./useComposer";

/**
 * What keeps Generate disabled for the composer's own content: an entry the
 * composer cannot send (the swap runs from a script or an agent), no source to
 * upscale, no prompt, an Edit without its reference, or boxes that cannot be
 * sent. `composed` is the prompt as it will be sent.
 */
export function composerBlocked(
  state: ComposerState,
  sourceId: string,
  composed: string,
): boolean {
  const { generator } = state;
  if (entryFor(generator, state.model).outsideComposer) return true;
  if (isDeployModel(state.model)) {
    try {
      const template = deployTemplates.find(
        (t) =>
          t.file ===
          `workflows/${deployEndpoint(state.model as import("../shared/comfy/deploy-catalogue").DeployModel).workflow}`,
      )!;
      deployValues(template, state, composed);
      return !composed.trim();
    } catch {
      return true;
    }
  }
  if (generator === "upscale") return !sourceId;
  if (generator === "audio") return musicBlocked(state);
  if (isH3(state.model) || isH3Router(state.model))
    return (
      (isH3(state.model) && !state.sourceId) ||
      state.imageReferences?.length !== 2 ||
      !composed.trim()
    );
  if (state.model === "flux-3-i2v" && !state.imageReferences?.length)
    return true;
  if (!isImage(generator)) return ltxBlocked(state);
  const regions = isKlein(state.model) ? state.imageRegions : [];
  if (!composed.trim()) return true;
  if (
    imagePrompt(state.description, regions, imageEditing(state)).length >
    IMAGE_DESCRIPTION_LIMIT
  )
    return true;
  if (imageEditing(state) && !state.imageReferences?.length) return true;
  return Boolean(regionBlocker(regions, imageEditing(state)));
}
