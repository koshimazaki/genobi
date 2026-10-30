import {
  OUTPUT_TARGETS,
  outputTargets,
  type OutputTargetId,
} from "../../shared/output-targets";
import { readyEntry } from "../../shared/registry";
import { takeUpscale } from "../../shared/review";
import type { Job, Source } from "../../shared/types";
import { NEEDS_KEY } from "../chain-client";
import { chainSummary, stageName, type ChainEntry } from "../chain-state";
import { useSettingsHold } from "../settings-store";
import Icon from "./Icon";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * The review step, laid over the bottom of the main view so it never moves the
 * composer or the gallery. Either a chain (Fast, or a Studio upscale already
 * priced) with its stages, its pause's quote and Approve or Cancel; or a ready
 * Studio draft with the output choice, priced by the server before anything
 * can be approved.
 */
export default function ReviewStep({
  entry,
  draft,
  target,
  onTarget,
  quoting,
  quoteError,
  now,
  onQuote,
  onApprove,
  onCancel,
  onRefresh,
  onConnectKey,
  onClose,
}: {
  entry?: ChainEntry;
  draft?: { job: Job; source?: Source };
  target: OutputTargetId;
  onTarget: (target: OutputTargetId) => void;
  quoting: boolean;
  quoteError: string;
  now: number;
  onQuote: () => void;
  onApprove: (entry: ChainEntry) => void;
  onCancel: (entry: ChainEntry) => void;
  onRefresh: (entry: ChainEntry) => void;
  onConnectKey: () => void;
  onClose: () => void;
}) {
  const title = entry
    ? entry.origin === "fast"
      ? "Fast"
      : "Review"
    : "Review · draft ready";
  return (
    <section className="review-step" aria-label="Review step">
      <header className="review-step__head">
        <strong>{title}</strong>
        <span>
          {entry ? chainSummary(entry) : "Choose the output to upscale to"}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="Close the review step"
          onClick={onClose}
        >
          <Icon name="close" size={13} />
        </button>
      </header>
      {entry ? (
        <ChainBody
          entry={entry}
          now={now}
          onApprove={onApprove}
          onCancel={onCancel}
          onRefresh={onRefresh}
          onConnectKey={onConnectKey}
        />
      ) : draft ? (
        <DraftBody
          draft={draft}
          target={target}
          onTarget={onTarget}
          quoting={quoting}
          onQuote={onQuote}
        />
      ) : null}
      {(entry?.refusal || (!entry && quoteError)) && (
        <p className="review-step__refusal" role="alert">
          {entry?.refusal?.message ?? quoteError}
          {(entry?.refusal?.code === NEEDS_KEY ||
            entry?.refusal?.code === "invalid_key") && (
            <button
              type="button"
              className="text-button"
              onClick={onConnectKey}
            >
              Connect key
            </button>
          )}
        </p>
      )}
    </section>
  );
}

function ChainBody({
  entry,
  now,
  onApprove,
  onCancel,
  onRefresh,
  onConnectKey,
}: {
  entry: ChainEntry;
  now: number;
  onApprove: (entry: ChainEntry) => void;
  onCancel: (entry: ChainEntry) => void;
  onRefresh: (entry: ChainEntry) => void;
  onConnectKey: () => void;
}) {
  const { chain } = entry;
  // While a lost approval is being checked, nothing else may be sent.
  const busy = entry.busy ?? (entry.uncertain ? "read" : undefined);
  const hold = useSettingsHold();
  const quote = chain.status === "paused" ? chain.quote : undefined;
  const expired = quote ? Date.parse(quote.expiresAt) <= now : false;
  return (
    <>
      <ol className="review-step__stages" aria-label="Stages">
        {chain.stages.map((stage, index) => (
          <li key={index} data-status={stage.status}>
            {stageName(chain, index)} · {stage.status}
          </li>
        ))}
      </ol>
      {chain.status === "paused" && (
        <div className="review-step__row">
          <p className="review-step__quote">
            {entry.uncertain ? (
              "The approval's answer was lost. Checking where this chain stands…"
            ) : quote ? (
              <>
                {readyEntry(quote.recipe.id)?.label ?? quote.recipe.id} · $
                {quote.estimateUsd.toFixed(2)} est. ·{" "}
                {expired
                  ? "quote expired"
                  : `quote expires ${time(quote.expiresAt)}`}
              </>
            ) : entry.needsKey ? (
              "Connect your key to price this stage."
            ) : entry.pauseError ? (
              entry.pauseError.error
            ) : (
              "Pricing this stage…"
            )}
          </p>
          <div className="review-step__actions">
            <button
              type="button"
              className="text-button"
              disabled={Boolean(busy)}
              onClick={() => onCancel(entry)}
            >
              Cancel
            </button>
            {entry.needsKey ? (
              <button
                type="button"
                className="review-step__go"
                onClick={onConnectKey}
              >
                Connect key
              </button>
            ) : !quote || expired ? (
              <button
                type="button"
                className="review-step__go"
                disabled={Boolean(busy)}
                onClick={() => onRefresh(entry)}
              >
                Refresh quote
              </button>
            ) : (
              <button
                type="button"
                className="review-step__go"
                // Held like Generate while a settings save or restore is open.
                disabled={Boolean(busy) || Boolean(hold)}
                aria-busy={busy === "approve"}
                onClick={() => onApprove(entry)}
              >
                {busy === "approve"
                  ? "Approving…"
                  : hold === "restoring"
                    ? "Restoring…"
                    : hold === "checking"
                      ? "Checking settings…"
                      : hold
                        ? "Saving settings…"
                        : `Approve $${quote.estimateUsd.toFixed(2)}`}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function DraftBody({
  draft,
  target,
  onTarget,
  quoting,
  onQuote,
}: {
  draft: { job: Job; source?: Source };
  target: OutputTargetId;
  onTarget: (target: OutputTargetId) => void;
  quoting: boolean;
  onQuote: () => void;
}) {
  const plan = draft.source
    ? takeUpscale(target, draft.source)
    : ({ ok: false, reason: "This take's clip is not measured yet." } as const);
  return (
    <>
      <div className="review-step__targets" role="group" aria-label="Output">
        {OUTPUT_TARGETS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === target}
            onClick={() => onTarget(id)}
          >
            {outputTargets[id].label}
          </button>
        ))}
      </div>
      <div className="review-step__row">
        <p className="review-step__quote">
          {plan.ok
            ? `${plan.factor}× upscale to ${plan.shortEdge}p · ≈ $${plan.estimateUsd.toFixed(2)}; the server quotes it before you approve`
            : plan.reason}
        </p>
        <div className="review-step__actions">
          <button
            type="button"
            className="review-step__go"
            disabled={!plan.ok || quoting}
            aria-busy={quoting}
            onClick={onQuote}
          >
            {quoting ? "Pricing…" : "Quote upscale"}
          </button>
        </div>
      </div>
    </>
  );
}
