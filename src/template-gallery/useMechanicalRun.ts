import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  mechanicalDefaults,
  type MechanicalRecipe,
} from "../../shared/templates/mechanical";
import { isMechanical } from "../../shared/templates/run-kind";
import type { HouseTemplate } from "../../shared/templates/types";
import { isTerminal } from "../../shared/types";
import { addedMessage } from "../studio/project-assets";
import { useGenerationBridge } from "../scrolls/bridge";
import {
  addResultToAssets,
  quoteMechanical,
  submitMechanical,
  type MechanicalApproval,
} from "./mechanical-run";
import type { TemplatePicks } from "./open-template";
import { CHECK_HISTORY, needsCheck, pendingRuns } from "./pending-runs";

/** Asked before a new run when a reloaded record may still be running. */
export const CHECK_FIRST = `${CHECK_HISTORY} Generate a new run anyway?`;

export type RunStep = "" | "quoting" | "submitting" | "adding";

/**
 * The drawer's state for a mechanical template: the editable recipe, the
 * quote waiting for confirmation, and the run it started, read from the
 * Camera's own job list so its progress and result are the Camera's.
 * Changing the recipe or a reference drops the quote: a new price needs a
 * new quote and a new key.
 */
export function useMechanicalRun(
  template: HouseTemplate,
  chosen: TemplatePicks,
) {
  const mechanical = isMechanical(template);
  const bridge = useGenerationBridge();
  const [recipe, setRecipe] = useState<MechanicalRecipe | undefined>(() =>
    mechanical ? mechanicalDefaults(template) : undefined,
  );
  const [approval, setApproval] = useState<MechanicalApproval>();
  const [step, setStep] = useState<RunStep>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const snapshot = () => pendingRuns.get(template.id);
  const pending = useSyncExternalStore(
    pendingRuns.subscribe,
    snapshot,
    snapshot,
  );
  const job = pending?.jobId
    ? bridge?.jobs.find((j) => j.id === pending.jobId)
    : undefined;
  // A changed recipe or reference needs a new quote, even one in flight.
  const revision = useRef(0);
  useEffect(() => {
    revision.current += 1;
    setApproval(undefined);
  }, [recipe, chosen]);
  const running = !!job && !isTerminal(job.status);
  // Reloaded mid-run: the record survived, the job is not in Camera's list.
  const check = needsCheck(pending, !!job);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  async function act(kind: RunStep, action: () => Promise<void>) {
    setStep(kind);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The run could not start.");
    } finally {
      setStep("");
    }
  }
  const quote = () =>
    act("quoting", async () => {
      if (!bridge) throw new Error("Camera is still opening. Try again.");
      if (check) {
        if (!window.confirm(CHECK_FIRST)) return;
        pendingRuns.clear(template.id);
      }
      const asked = revision.current;
      const quoted = await quoteMechanical(template, chosen, recipe!, {
        key: bridge.key,
      });
      if (asked !== revision.current)
        throw new Error("The recipe changed while quoting. Generate again.");
      setApproval(quoted);
    });
  const confirm = () =>
    act("submitting", async () => {
      if (!bridge || !approval) throw new Error("Generate again for a quote.");
      const quoted = approval;
      // One click, one submission: the quote is spent whatever the answer.
      setApproval(undefined);
      await submitMechanical(quoted, {
        generate: bridge.generate,
        record: pendingRuns.record,
      });
    });
  const add = () =>
    act("adding", async () => {
      if (!job) return;
      setNotice(addedMessage(await addResultToAssets(template, chosen, job)));
    });
  return {
    mechanical,
    recipe,
    setRecipe,
    approval,
    cancel: () => setApproval(undefined),
    quote,
    confirm,
    add,
    step,
    error,
    notice,
    pending,
    job,
    running,
    check,
    now,
  };
}

export type MechanicalRun = ReturnType<typeof useMechanicalRun>;
