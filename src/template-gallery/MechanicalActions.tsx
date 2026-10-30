import { CREDITS_PER_USD } from "../../shared/comfy/ltx";
import type { Quote } from "../../shared/quote";
import Icon from "../components/Icon";
import type { MechanicalRun } from "./useMechanicalRun";

/** A quote's price as the composer shows a Router run's: dollars and credits. */
export const quotePrice = (quote: Quote) =>
  quote.billing ??
  `$${quote.estimateUsd.toFixed(2)} · ${Math.round(quote.estimateUsd * CREDITS_PER_USD)} credits`;

/**
 * Generate for a mechanical template: quote, then confirm the price, then
 * one submission. The second slot holds Cancel quote or Add to project
 * assets and keeps its size when empty, so the actions below never move.
 */
export function MechanicalPrimary({
  run,
  disabled,
}: {
  run: MechanicalRun;
  disabled: boolean;
}) {
  const ready = run.job?.status === "Ready";
  const label =
    run.step === "quoting"
      ? "Quoting…"
      : run.step === "submitting"
        ? "Starting…"
        : run.running
          ? "Generating…"
          : run.approval
            ? `Confirm · ${quotePrice(run.approval.quote)}`
            : run.check
              ? "Generate · check Camera history first"
              : ready
                ? "Generate again"
                : "Generate";
  const extra = run.approval
    ? { text: "Cancel quote", act: run.cancel }
    : ready && run.job?.resultUrl
      ? {
          text: run.step === "adding" ? "Adding…" : "Add to project assets",
          act: () => void run.add(),
        }
      : undefined;
  return (
    <>
      <button
        type="button"
        className="template-primary"
        data-confirm={run.approval ? "true" : undefined}
        disabled={disabled || run.step !== "" || run.running}
        onClick={() => void (run.approval ? run.confirm() : run.quote())}
      >
        {label}
        <Icon name="arrow" size={16} />
      </button>
      <button
        type="button"
        className="template-secondary template-slot"
        data-empty={extra ? undefined : "true"}
        disabled={!extra || disabled || run.step !== ""}
        onClick={extra?.act}
      >
        {extra?.text ?? "Add to project assets"}
      </button>
    </>
  );
}

/** The status line under the actions for a mechanical template. */
export function mechanicalStatus(run: MechanicalRun) {
  if (run.notice) return run.notice;
  if (run.check)
    return "This page was reloaded during a run. Check Camera history before generating again.";
  if (run.approval) {
    const { input, quote } = run.approval;
    return `${input.duration} s · ${input.aspectRatio} · ${quotePrice(quote)}. Confirm spends it once; changing anything asks for a new quote.`;
  }
  if (run.job?.status === "Ready")
    return "Done. Play it above, add it to project assets, or take it further.";
  return "Generate quotes this run first. Nothing is spent until you confirm the price.";
}
