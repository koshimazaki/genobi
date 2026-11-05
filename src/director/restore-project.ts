import { studioStore, type createStudioStore } from "../studio/store";
import { importBundle } from "./bundle";

/** Validate all bytes before one guarded commit, including an initially empty studio. */
export async function restoreProject(
  file: File,
  store: ReturnType<typeof createStudioStore> = studioStore,
) {
  const before = store.getState().director.bundle;
  const next = await importBundle(file, before);
  if (store.getState().director.bundle !== before)
    throw new Error(
      "Project changed while the archive was opening; open it again when ready",
    );
  store.getState().actions.commit(next, before);
  return store.getState().director.bundle!;
}
