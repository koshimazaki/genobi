import { useEffect, useRef, useState } from "react";
import type { Job } from "../shared/types";
import { runInputStore } from "./run-inputs";
import { recreateGapMessage, recreateGaps } from "./recreate-gaps";
import { onCameraRecipe } from "./camera-recipe-target";
import { setupChoices, supersedeRestores } from "./settings-store";
import { restoreRun } from "./useRecreate";
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
  const edit = useRef({ update, onError });
  edit.current = { update, onError };
  useEffect(
    () =>
      onCameraRecipe(({ patch, note }) => {
        edit.current.update?.(patch);
        edit.current.onError(note);
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
      await restoreRun(job, onError);
    } finally {
      if (sequenceId === sequence.current) setPending(false);
    }
  }
  return { recreate, pending };
}
