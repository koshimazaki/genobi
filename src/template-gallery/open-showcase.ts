import { showcaseLink } from "../../shared/showcase/types";
import { studioStore } from "../studio/store";
import { go } from "./template-actions";

/**
 * Open one showcase version in the Editor as its own project: the open
 * project or its kept draft if the person already has that version, else
 * the version as recorded. The commit keeps the previous project as a
 * draft, as opening a template does.
 */
export async function openShowcase(
  project: string,
  version: number,
  navigate: (url: string) => void = go,
) {
  const state = studioStore.getState();
  if (Object.values(state.operations).some(Boolean))
    throw new Error("Wait for playback, import or export to finish first.");
  const { loadShowcase, findShowcase } = await import("../director/showcase");
  const id = findShowcase(project)?.versions.find(
    (v) => v.version === version,
  )?.projectId;
  if (!id) throw new Error("This showcase version is unavailable.");
  if (state.director.bundle?.project.id !== id) {
    state.actions.operations({ workingFile: true });
    try {
      const bundle =
        state.director.drafts[id]?.bundle ??
        (await loadShowcase(project, version)).bundle;
      if (studioStore.getState().director.bundle !== state.director.bundle)
        throw new Error("Project changed while opening. Try again.");
      state.actions.commit(bundle, state.director.bundle);
    } finally {
      state.actions.operations({ workingFile: false });
    }
  }
  navigate(showcaseLink(project, version));
}
