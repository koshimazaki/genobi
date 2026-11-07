import { useEffect, useRef, useState } from "react";
import { GenerationQueue } from "./generation-queue";
import { submitWithDeploymentApproval } from "./deployment-approval";
import { expectedHeaders } from "./settings-store";
import type { GenerateInput } from "../shared/types";
import type { ComposerState } from "./useComposer";

/**
 * The studio's submit path with a queue behind it (`generation-queue.ts`).
 * `add` sends a run at once when nothing is being submitted, and otherwise
 * queues it behind the submission in flight. `leftCamera` drops unsent runs:
 * those already sent are server jobs and keep going in the gallery.
 */
export function useGenerationQueue<T>(
  send: (run: T) => Promise<boolean>,
  onNote: (note: string) => void,
  leftCamera = false,
) {
  const sendRef = useRef(send);
  sendRef.current = send;
  const noteRef = useRef(onNote);
  noteRef.current = onNote;
  const [state, setState] = useState({ queued: 0, sending: false });
  const [queue] = useState(
    () =>
      new GenerationQueue<T>((run) => sendRef.current(run), {
        change: setState,
        halt: (note) => note && noteRef.current(note),
      }),
  );
  useEffect(() => {
    if (leftCamera) queue.leave();
  }, [leftCamera, queue]);
  // Unmounting drops what was never sent; nothing may be sent after it.
  useEffect(() => () => void queue.clear(), [queue]);
  return {
    /** A submission request is in flight. */
    submitting: state.sending,
    /** Runs waiting behind it, not yet sent. */
    queued: state.queued,
    add: (run: T) => queue.add(run),
    clear: () => void queue.clear(),
  };
}

/** A Camera run as Generate took it: the input and the composer behind it. */
export interface CameraRun {
  input: GenerateInput;
  composer: ComposerState;
}

/**
 * Camera's queue: Cloud workflows quote first and disclose unknown availability;
 * deployments always ask for confirmation. Then `generate` uses the quote's
 * request key, or mints a fresh Idempotency-Key for other routes.
 * The run location and workflow are taken with the run, so a queued run is
 * sent as it was queued: a setting changed since then is the server's to
 * refuse, never a different route for a paid run.
 * `visible` is the shell's panels; without the composer, Camera was left.
 */
export function useCameraQueue(
  key: string,
  generate: (
    input: GenerateInput,
    approval: { quoteId: string; idempotency: string } | undefined,
    composer: ComposerState,
    expected: Record<string, string>,
  ) => Promise<unknown>,
  onNote: (note: string) => void,
  visible?: readonly string[],
) {
  const queue = useGenerationQueue(
    (run: CameraRun & { expected: Record<string, string> }) =>
      submitWithDeploymentApproval(
        run.input,
        key,
        (input, approval) =>
          generate(input, approval, run.composer, run.expected),
        run.expected,
      ),
    onNote,
    Boolean(visible && !visible.includes("composer")),
  );
  return {
    ...queue,
    add: (run: CameraRun) =>
      queue.add({ ...run, expected: expectedHeaders(run.input) }),
  };
}
