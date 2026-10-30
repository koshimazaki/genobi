import { useState } from "react";
import type { Generator } from "../../shared/types";
import Icon from "./Icon";
import ComposedPreview from "./ComposedPreview";
import type { Segment } from "../../shared/ltx-prompt";

/**
 * The line under the composer: the run's description and the session spend,
 * and the composed prompt (or the upscale settings) behind a toggle, with a
 * copy button. The composer owns what is shown; this owns showing it.
 */
export default function StudioFoot({
  generator,
  foot,
  total,
  composed,
  parts,
  onError,
}: {
  generator: Generator;
  /** `generatorFoot` for the held entry. */
  foot: string;
  total: number;
  composed: string;
  /** LTX video: the prompt's parts, shown colour-coded and labelled. */
  parts?: readonly Segment[];
  onError: (message: string) => void;
}) {
  const [showPrompt, setShowPrompt] = useState(false),
    [copied, setCopied] = useState(false);
  return (
    <>
      <div className="studio-foot">
        <button
          className="text-button"
          aria-expanded={showPrompt}
          onClick={() => setShowPrompt(!showPrompt)}
        >
          <span className="prompt-dot" />
          {showPrompt ? "Hide" : "View"}{" "}
          {generator !== "upscale" ? "composed prompt" : "upscale settings"}
          <Icon
            name="chevron"
            size={12}
            style={{ transform: showPrompt ? "rotate(180deg)" : undefined }}
          />
        </button>
        <span>
          {/* One line at every width: a long model name ends in an ellipsis
              (full text in the title) rather than wrapping, so choosing a
              model never moves the gallery below. */}
          <span className="studio-foot__line" title={foot}>
            {foot}
          </span>
          <i />
          <span className="studio-foot__session">
            Session ${total.toFixed(2)}
          </span>
        </span>
      </div>
      {showPrompt && (
        <div className="composed-prompt">
          {parts ? (
            <ComposedPreview segments={parts} kept={composed.length} />
          ) : (
            <p>{composed}</p>
          )}
          <button
            className="icon-button"
            onClick={() =>
              void navigator.clipboard
                .writeText(composed)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                })
                .catch(() =>
                  onError(
                    "Clipboard access is unavailable. Select the prompt to copy it.",
                  ),
                )
            }
            aria-label={
              generator !== "upscale"
                ? "Copy composed prompt"
                : "Copy upscale settings"
            }
          >
            <Icon name={copied ? "check" : "copy"} size={16} />
          </button>
        </div>
      )}
    </>
  );
}
