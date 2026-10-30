import { readyEntry } from "../../shared/registry";
import { outputTargets } from "../../shared/output-targets";
import { chainSummary, stageName, type ChainEntry } from "../chain-state";
import Icon from "./Icon";

/**
 * A chain in the gallery: its stages and where it stands (paused for approval
 * with the quote, running, ready, failed or cancelled). Each stage that ran is
 * also an ordinary card of its own. Approving happens in the review step on
 * the main view, the one place a paid stage is started from.
 */
export default function ChainCard({
  entry,
  onReview,
}: {
  entry: ChainEntry;
  onReview: (id: string) => void;
}) {
  const { chain } = entry;
  const label = chain.stages[0].input.description || "Untitled chain";
  const quote = chain.status === "paused" ? chain.quote : undefined;
  return (
    <article
      className="clip-card chain-card"
      data-status={chain.status}
      aria-label={`Chain: ${label}`}
    >
      <div className="chain-card__body">
        <span className="clip-badge">
          {entry.origin === "fast" ? "FAST" : "REVIEW"} ·{" "}
          {chain.target
            ? outputTargets[chain.target].label.toUpperCase()
            : "UPSCALE"}
        </span>
        <ol className="chain-card__stages">
          {chain.stages.map((stage, index) => (
            <li key={index} data-status={stage.status}>
              <span>{stageName(chain, index)}</span>
              <span>{stage.status}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="clip-info">
        <h3>{label}</h3>
        <div className="clip-meta">
          <span>
            {chainSummary(entry)}
            {quote
              ? ` · ${readyEntry(quote.recipe.id)?.label ?? quote.recipe.id} $${quote.estimateUsd.toFixed(2)} est.`
              : ""}
          </span>
          <button type="button" onClick={() => onReview(chain.id)}>
            Review <Icon name="arrow" size={12} />
          </button>
        </div>
      </div>
    </article>
  );
}
