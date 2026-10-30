import { useRef } from "react";
import type { Job } from "../shared/types";
import type { ComposerState } from "./useComposer";
import { readReference } from "./image-files";

/** Explicitly start a new edit from a result, separately from Recreate. */
export function useImageEdit(
  update: (patch: Partial<ComposerState>) => void,
  select: (job: Job) => void,
  onError: (message: string) => void,
  onBusy: (busy: boolean) => void,
) {
  const busy = useRef(false);
  return async (job: Job) => {
    if (!job.resultUrl || busy.current) return;
    busy.current = true;
    onBusy(true);
    try {
      const response = await fetch(job.resultUrl, { cache: "no-store" });
      if (!response.ok)
        throw new Error("This saved image is no longer available.");
      const blob = await response.blob();
      const reference = await readReference(
        new File([blob], "saved-image", { type: blob.type }),
      );
      update({
        generator: "edit",
        model: "flux-3",
        description: "",
        imageReferences: [reference],
        imageRegions: [],
        imageAspectRatio: "auto",
      });
      select(job);
      onError("");
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Could not prepare this image.",
      );
    } finally {
      busy.current = false;
      onBusy(false);
    }
  };
}
