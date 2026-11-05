import { useEffect, useRef, useState } from "react";
import type { Job } from "../shared/types";
import { runInputStore } from "./run-inputs";
import { recreateGapMessage, recreateGaps } from "./recreate-gaps";
import {
  cameraNotice,
  onCameraRecipe,
  setCameraNotice,
} from "./camera-recipe-target";
import {
  restoreWrites,
  setupChoices,
  supersedeRestores,
} from "./settings-store";
import { restoreRun } from "./useRecreate";
import { RESTORE_FAILED } from "./run-restore";
import type { ComposerState, useComposer } from "./useComposer";
import { studioStore } from "./studio/store";

/** A non-existent source id suppresses the default source fallback during upload. */
export const ASSET_UPLOAD_PENDING = "__asset-upload-pending__";

/** Clears a dropped upload's "Uploading …" note, never a newer one. */
function dropNotice(owner: { upload: number; note: string }, upload: number) {
  if (owner.upload === upload && cameraNotice() === owner.note)
    setCameraNotice("");
}

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
  const edit = useRef({ update, onError, dispatch, uploadVideo });
  edit.current = { update, onError, dispatch, uploadVideo };
  const uploads = useRef(0);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  // The handoff whose note Camera shows; a dropped upload takes it along.
  const noticeOwner = useRef({ upload: 0, note: "" });
  useEffect(
    () =>
      onCameraRecipe(({ patch, note, job, location, video }) => {
        const upload = ++uploads.current;
        // A commit replaces the bundle object; only another project drops it.
        const project = () =>
          studioStore.getState().director.bundle?.project.id;
        const originalProject = project();
        // A recorded run comes back whole through Camera's own restore; the
        // patch then replaces its references with the project's images.
        if (job) {
          supersedeRestores();
          edit.current.dispatch({ type: "restore", job });
        }
        // Never let the composer silently fall back to a previous source while
        // another MP4 is being uploaded. Generate stays disabled until it ends.
        setUploadingVideo(Boolean(video));
        edit.current.update?.(
          video ? { ...patch, sourceId: ASSET_UPLOAD_PENDING } : patch,
        );
        // A restore is not an error: its note is a neutral status line.
        edit.current.onError("");
        noticeOwner.current = { upload, note };
        setCameraNotice(note);
        if (location)
          restoreWrites
            .location(location)
            .catch(() => edit.current.onError(RESTORE_FAILED));
        if (!video) return;
        const send = edit.current.uploadVideo;
        if (!send) {
          setUploadingVideo(false);
          edit.current.onError("Video upload is unavailable.");
          return;
        }
        const waiting = () =>
          upload === uploads.current &&
          latest.current.generator === "upscale" &&
          latest.current.sourceId === ASSET_UPLOAD_PENDING;
        const current = () => waiting() && project() === originalProject;
        const drop = () => {
          dropNotice(noticeOwner.current, upload);
          // Still waiting on this upload: say why, so Upscale is not stuck.
          if (waiting())
            edit.current.onError(
              `The Director project changed while ${video.name} was uploading. Choose Upscale's source again.`,
            );
        };
        send(video)
          .then(
            (sourceId) => {
              // Newer source, new project, workspace change or Recreate wins.
              if (!current()) return drop();
              edit.current.update?.({ sourceId });
              setCameraNotice(
                `${video.name} is Upscale's source. Nothing was generated.`,
              );
            },
            (error: unknown) => {
              if (!current()) return drop();
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
      (state.generator !== "upscale" || state.sourceId !== ASSET_UPLOAD_PENDING)
    ) {
      dropNotice(noticeOwner.current, uploads.current++);
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
      // A failed take read adds its sentence; it never hides what is missing.
      await restoreRun(job, (message) =>
        onError(message && gaps ? `${gaps} ${message}` : message),
      );
    } finally {
      if (sequenceId === sequence.current) setPending(false);
    }
  }
  return { recreate, pending, uploadingVideo };
}
