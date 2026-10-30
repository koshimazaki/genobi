/**
 * Put a playblast on its own Director track at frame 0, through the
 * Director's own media import (`addMedia`) and the studio store's commit
 * guard, the same path as a file dropped on the timeline. The asset is
 * production media, so the Director can send it as a guide later. A cancel
 * at any point before the commit leaves the project untouched.
 */
import { addMedia } from "../director/import-media";
import { studioStore } from "../studio/store";

export async function addPlayblastToDirector(
  file: File,
  name: string,
  signal?: AbortSignal,
  store = studioStore,
): Promise<string> {
  signal?.throwIfAborted();
  const state = store.getState();
  const before = state.director.bundle;
  if (!before)
    throw new Error("The project is still opening. Try again in a moment.");
  if (Object.values(state.operations).some(Boolean))
    throw new Error("Wait for the current edit or render to finish.");
  state.actions.operations({ workingFile: true });
  try {
    const next = await addMedia(before, [file], 0);
    const added = next.project.layers.find(
      (l) => !before.project.layers.some((old) => old.id === l.id),
    );
    if (!added) throw new Error("The playblast did not reach the timeline.");
    added.name = name.slice(0, 120);
    if (store.getState().director.bundle !== before)
      throw new Error("The project changed while saving; save again.");
    // A cancel while the import read or inspected the file still wins.
    signal?.throwIfAborted();
    store.getState().actions.commit(next, before);
    return added.id;
  } finally {
    store.getState().actions.operations({ workingFile: false });
  }
}
