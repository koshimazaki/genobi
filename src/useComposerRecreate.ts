import { useEffect, useRef, useState } from "react";
import type { Job } from "../shared/types";
import { runInputStore, restoredRunInputs } from "./run-inputs";
import { setupChoices, supersedeRestores } from "./settings-store";
import { restoreRun } from "./useRecreate";
import type { ComposerState, useComposer } from "./useComposer";

/** Read saved files before changing the composer; newer edits always win. */
export function useComposerRecreate(
  state: ComposerState,
  dispatch: ReturnType<typeof useComposer>["dispatch"],
  onError: (message: string) => void,
) {
  const latest = useRef(state);
  latest.current = state;
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
      const restored = restoredRunInputs(job, inputs);
      if (
        (job.imageReferenceCount ?? 0) > (restored.imageReferences?.length ?? 0)
      )
        onError(
          "The original reference files are unavailable in this browser. Reattach them before generating.",
        );
      await restoreRun(job, onError);
    } finally {
      if (sequenceId === sequence.current) setPending(false);
    }
  }
  return { recreate, pending };
}
