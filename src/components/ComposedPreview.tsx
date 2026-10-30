import type { CSSProperties } from "react";
import { promptParts, type Segment } from "../../shared/ltx-prompt";

/**
 * The LTX paragraph as it will be sent, each part in its colour and named
 * by a small label, so the colour is never the only cue. Text the 1,200
 * character limit would cut is struck through and marked.
 */
export default function ComposedPreview({
  segments,
  kept,
}: {
  segments: readonly Segment[];
  /** The length of the prompt that is sent; anything past it is cut. */
  kept: number;
}) {
  let at = 0;
  return (
    <p className="composed-parts">
      {segments.map((item, index) => {
        const start = at + item.separator.length;
        at = start + item.text.length;
        const keep = Math.max(0, Math.min(item.text.length, kept - start));
        const part = promptParts[item.part];
        const label =
          index > 0 && segments[index - 1].part === item.part
            ? null
            : part.label;
        return (
          <span
            key={index}
            className="composed-part"
            data-part={item.part}
            style={{ "--part-color": `var(${part.color})` } as CSSProperties}
          >
            {item.separator}
            {label && <span className="composed-part__label">{label}</span>}
            {item.text.slice(0, keep)}
            {keep < item.text.length && (
              <del
                className="composed-part__cut"
                title="Cut at 1,200 characters"
              >
                {item.text.slice(keep)}
              </del>
            )}
          </span>
        );
      })}
    </p>
  );
}
