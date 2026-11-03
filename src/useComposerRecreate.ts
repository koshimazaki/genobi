import { useEffect, useRef, useState } from "react";
import type { Job } from "../shared/types";
import { runInputStore } from "./run-inputs";
import { recreateGapMessage, recreateGaps } from "./recreate-gaps";
import { onCameraRecipe, setCameraNotice } from "./camera-recipe-target";
import { setupChoices, supersedeRestores } from "./settings-store";
import { restoreRun } from "./useRecreate";
import { RESTORE_FAILED } from "./run-restore";
import { restoreWrites } from "./settings-store";
import type { ComposerState, useComposer } from "./useComposer";

/** Read saved files before changing the composer; newer edits always win. */
export function useComposerRecreate(
  state: ComposerState,
  dispatch: ReturnType<typeof useComposer>["dispatch"],
  onError: (message: string) => void,
  update?: (patch: Partial<ComposerState>) => void,
) {
  const latest = useRef(state);
  latest.current = state;
  // A Director slot's Recreate in Camera (#57) arrives here as an edit.
  const edit = useRef({ update, onError, dispatch });
  edit.current = { update, onError, dispatch };
  useEffect(
    () =>
      onCameraRecipe(({ patch, note, job, location }) => {
        // A recorded run comes back whole through Camera's own restore; the
        // patch then replaces its references with the project's images.
        if (job) {
          supersedeRestores();
          edit.current.dispatch({ type: "restore", job });
        }
        edit.current.update?.(patch);
        // A restore is not an error: its note is a neutral status line.
        edit.current.onError("");
        setCameraNotice(note);
        if (location)
          restoreWrites
            .location(location)
            .catch(() => edit.current.onError(RESTORE_FAILED));
      }),
    [],
  );
  const sequence = useRef(0);
  const [pending, setPending] = useState(false);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  async function recreate(job: Job) {
    const sequenceId = ++sequence.current,
      origin = latest.current;
    supersedeRestores();
    const generation = setupChoices.current();
    setPending(true);
    onError("");
    try {
      const inputs = await runInputStore.load(job.id);
      if (
        sequenceId !== sequence.current ||
        latest.current !== origin ||
        generation !== setupChoices.current()
      )
        return;
      dispatch({ type: "restore", job, inputs });
      // Name whatever this browser or the job did not keep, per model.
      const gaps = recreateGapMessage(recreateGaps(job, inputs));
      if (gaps) onError(gaps);
      // A failed take read adds its sentence; it never hides what is missing.
      await restoreRun(job, (message) =>
        onError(message && gaps ? `${gaps} ${message}` : message),
      );
    } finally {
      if (sequenceId === sequence.current) setPending(false);
    }
  }
  return { recreate, pending };
}
