import { useEffect, useRef, useState } from "react";
import type { Job } from "../shared/types";
import { runInputStore } from "./run-inputs";
import { recreateGapMessage, recreateGaps } from "./recreate-gaps";
import { onCameraRecipe, setCameraNotice } from "./camera-recipe-target";
import { setupChoices, supersedeRestores } from "./settings-store";
import { restoreRun } from "./useRecreate";
import type { ComposerState, useComposer } from "./useComposer";

/** Read saved files before changing the composer; newer edits always win. */
export function useComposerRecreate(
  state: ComposerState,
  dispatch: ReturnType<typeof useComposer>["dispatch"],
  onError: (message: string) => void,
  update?: (patch: Partial<ComposerState>) => void,
  /** Uploads an MP4 as a video source and returns its id (`uploadVideoSource`). */
  uploadVideo?: (file: File) => Promise<string>,
) {
  const latest = useRef(state);
  latest.current = state;
  // A Director slot's Recreate in Camera (#57) arrives here as an edit.
  const edit = useRef({ update, onError, uploadVideo });
  edit.current = { update, onError, uploadVideo };
  const uploads = useRef(0);
  useEffect(
    () =>
      onCameraRecipe(({ patch, note, video }) => {
        const upload = ++uploads.current;
        edit.current.update?.(patch);
        // A restore is not an error: its note is a neutral status line.
        edit.current.onError("");
        setCameraNotice(note);
        const send = edit.current.uploadVideo;
        if (!video || !send) return;
        send(video).then(
          (sourceId) => {
            // A newer handoff, or leaving Upscale while it uploaded, wins.
            if (upload !== uploads.current) return;
            if (latest.current.generator !== "upscale") return;
            edit.current.update?.({ sourceId });
            setCameraNotice(
              `${video.name} is Upscale's source. Nothing was generated.`,
            );
          },
          (error: unknown) => {
            if (upload !== uploads.current) return;
            setCameraNotice("");
            edit.current.onError(
              error instanceof Error ? error.message : "The upload failed.",
            );
          },
        );
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
    uploads.current++; // a Recreate outranks a source still uploading
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
