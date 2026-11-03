import { useEffect, useRef, useState } from "react";
import type { Job } from "../shared/types";
import { runInputStore } from "./run-inputs";
import { recreateGapMessage, recreateGaps } from "./recreate-gaps";
import { onCameraRecipe, setCameraNotice } from "./camera-recipe-target";
import { setupChoices, supersedeRestores } from "./settings-store";
import { restoreRun } from "./useRecreate";
import type { ComposerState, useComposer } from "./useComposer";
import { studioStore } from "./studio/store";

/** A non-existent source id suppresses the default source fallback during upload. */
export const ASSET_UPLOAD_PENDING = "__asset-upload-pending__";

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
  const [uploadingVideo, setUploadingVideo] = useState(false);
  useEffect(
    () =>
      onCameraRecipe(({ patch, note, video }) => {
        const upload = ++uploads.current;
        const projectId = studioStore.getState().director.bundle?.project.id;
        // Never let the composer silently fall back to a previous source while
        // another MP4 is being uploaded. Generate stays disabled until it ends.
        setUploadingVideo(Boolean(video));
        edit.current.update?.(
          video ? { ...patch, sourceId: ASSET_UPLOAD_PENDING } : patch,
        );
        edit.current.onError("");
        setCameraNotice(note);
        if (!video) return;
        const send = edit.current.uploadVideo;
        if (!send) {
          setUploadingVideo(false);
          edit.current.onError("Video upload is unavailable.");
          return;
        }
        const current = () =>
          upload === uploads.current &&
          studioStore.getState().director.bundle?.project.id === projectId &&
          latest.current.generator === "upscale" &&
          latest.current.sourceId === ASSET_UPLOAD_PENDING;
        send(video)
          .then(
            (sourceId) => {
              // Newer source, new project, workspace change or Recreate wins.
              if (!current()) return;
              edit.current.update?.({ sourceId });
              setCameraNotice(
                `${video.name} is Upscale's source. Nothing was generated.`,
              );
            },
            (error: unknown) => {
              if (!current()) return;
              setCameraNotice("");
              edit.current.onError(
                error instanceof Error ? error.message : "The upload failed.",
              );
            },
          )
          .finally(() => {
            if (upload === uploads.current) setUploadingVideo(false);
          });
      }),
    [],
  );
  // If the person chooses a different source or leaves Upscale, the pending
  // upload no longer owns the composer, even if the network finishes later.
  useEffect(() => {
    if (
      uploadingVideo &&
      (state.generator !== "upscale" ||
        state.sourceId !== ASSET_UPLOAD_PENDING)
    ) {
      uploads.current++;
      setUploadingVideo(false);
    }
  }, [state.generator, state.sourceId, uploadingVideo]);
  const sequence = useRef(0);
  const [pending, setPending] = useState(false);
  useEffect(
    () => () => {
      sequence.current++;
      uploads.current++;
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
  return { recreate, pending, uploadingVideo };
}
