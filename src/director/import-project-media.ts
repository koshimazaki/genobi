import { studioStore, type createStudioStore } from "../studio/store";
import { executeStudioCommand } from "../studio/commands";

/** Sequential imports stop if another edit or a template switch intervenes. */
export async function importProjectMedia(
  files: File[],
  use: "production" | "reference",
  store: ReturnType<typeof createStudioStore> = studioStore,
) {
  if (files.length > 32) throw new Error("Add up to 32 files at a time.");
  let expected = store.getState().director.bundle;
  if (!expected) throw new Error("Open a project first.");
  for (const file of files) {
    if (store.getState().director.bundle !== expected)
      throw new Error("Project changed. Add the remaining files again.");
    const result = await executeStudioCommand(
      { op: "import-asset", revision: expected.project.revision, use },
      file,
      store,
    );
    const next = "bundle" in result ? result.bundle : undefined;
    expected = store.getState().director.bundle;
    // commit normalizes revision by shallow-copying the bundle. An unrelated
    // commit still advances revision (Undo included) or replaces its files.
    if (
      !next ||
      !expected ||
      expected.project.id !== next.project.id ||
      expected.project.revision !== next.project.revision ||
      expected.files !== next.files
    )
      throw new Error("Project changed. Add the remaining files again.");
  }
}
