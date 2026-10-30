import { withBrowserActivity } from "../activity/store";
import { studioStore, type createStudioStore } from "./store";
import { runDirectorCommand } from "../director/remix-commands";

/** UI and agent writes use the same synchronous reservation and commit guard. */
async function executeStudioCommandImpl(
  command: unknown,
  file?: File,
  store: ReturnType<typeof createStudioStore> = studioStore,
) {
  const state = store.getState(),
    before = state.director.bundle;
  if (!before) throw new Error("Open a project first");
  if (Object.values(state.operations).some(Boolean))
    throw new Error("Wait for the current edit or render to finish");
  state.actions.operations({ workingFile: true });
  try {
    const result = await runDirectorCommand(before, command, file);
    if (store.getState().director.bundle !== before)
      throw new Error("Project changed while the tool was running; retry");
    if ("bundle" in result && result.bundle)
      state.actions.commit(result.bundle, before);
    return result;
  } finally {
    state.actions.operations({ workingFile: false });
  }
}

export const executeStudioCommand = (
  ...args: Parameters<typeof executeStudioCommandImpl>
) => withBrowserActivity("director", () => executeStudioCommandImpl(...args));
