import {
  findHouseTemplate,
  findMixTemplate,
} from "../../shared/templates/catalogue";
import type { ReferencePicks } from "../../shared/templates/intake";
import type { TemplateReferences } from "../director/house-template";
import { studioStore } from "../studio/store";

/** The person's choices in the gallery's drop zones. */
export interface TemplatePicks {
  picks: ReferencePicks;
  dropped: TemplateReferences;
  /** The brief, when the person edited it in the drawer. */
  inputs?: { subject: string };
}

/**
 * Load into the same project owner; its commit saves the previous draft.
 * Without picks it is the `/director?example=<id>` path: the open project
 * or its draft if there is one, else the template with its samples. With
 * picks, the template is built with the person's references, as an undoable
 * commit over whatever is open.
 */
export async function openTemplate(id: string, chosen?: TemplatePicks) {
  const template = findHouseTemplate(id) ?? findMixTemplate(id);
  if (!template) throw new Error("This template is unavailable.");
  const state = studioStore.getState();
  if (Object.values(state.operations).some(Boolean))
    throw new Error("Wait for playback, import or export to finish first.");
  if (!chosen && state.director.bundle?.project.id === id) return;
  state.actions.operations({ workingFile: true });
  try {
    const house = await import("../director/house-template");
    // A mix has no references to pick: it opens as it is.
    const bundle = template.mix
      ? (state.director.drafts[id]?.bundle ??
        (await (
          await import("../director/mix-template")
        ).loadMixTemplate(template)))
      : chosen
        ? await house.loadTemplateWith(
            template,
            chosen.picks,
            chosen.dropped,
            chosen.inputs,
          )
        : (state.director.drafts[id]?.bundle ??
          (await house.loadHouseTemplate(template, "")));
    if (studioStore.getState().director.bundle !== state.director.bundle)
      throw new Error("Project changed while opening the template. Try again.");
    state.actions.commit(bundle, state.director.bundle);
  } finally {
    state.actions.operations({ workingFile: false });
  }
}
