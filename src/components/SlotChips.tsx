import type { CSSProperties } from "react";
import { acousticLabel, type AcousticSetting } from "../../shared/acoustic";
import { ltxExamples } from "../../shared/ltx-examples";
import { ltxSlots, SLOT_LIMIT, type SlotId } from "../../shared/ltx-prompt";
import {
  chipInsertion,
  ltxVocabulary,
  type ChipJoin,
} from "../../shared/ltx-vocabulary";

/**
 * Under a gap: its hint in the LTX guide's words, then one scrolling row of
 * chips. The guide's terms come first under its own headings; studio-authored
 * groups and example lines say so. A chip adds its phrase to the end of the
 * gap and never replaces what is there. The Audio gap opens with the
 * Acoustic Space choice where the entry has the switch, through the existing
 * dialog rather than a second control.
 */
export default function SlotChips({
  slot,
  text,
  onInsert,
  acoustic,
  onOpenAcoustic,
}: {
  slot: SlotId;
  text: string;
  onInsert: (text: string) => void;
  /** Undefined where the entry has no Acoustic Space switch. */
  acoustic?: AcousticSetting | null;
  onOpenAcoustic?: () => void;
}) {
  const info = ltxSlots.find((item) => item.id === slot)!;
  /** A chip's button: disabled, and saying why, when its phrase would not fit. */
  const chip = (
    key: string,
    label: string,
    phrase: string,
    join: ChipJoin,
    className = "slot-chip",
  ) => {
    const result = chipInsertion(text, phrase, join);
    return (
      <button
        type="button"
        key={key}
        className={className}
        disabled={!result.fits}
        aria-label={
          result.fits
            ? undefined
            : `${label}, unavailable: the ${info.label} gap would pass ${SLOT_LIMIT.toLocaleString("en-GB")} characters`
        }
        title={`Insert “${phrase.trim()}”`}
        onClick={() => onInsert(result.text)}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      className="slot-chips"
      style={{ "--part-color": `var(${info.color})` } as CSSProperties}
    >
      <p className="slot-hint" title={info.hint}>
        <span className="slot-hint__source">LTX guide</span> {info.hint}
      </p>
      <div
        className="slot-chips__row"
        role="group"
        aria-label={`${info.label} vocabulary`}
      >
        {acoustic !== undefined && onOpenAcoustic && (
          <button
            type="button"
            className="slot-chip slot-chip--acoustic"
            aria-haspopup="dialog"
            onClick={onOpenAcoustic}
          >
            Acoustic space · {acoustic ? acousticLabel(acoustic) : "Off"}
          </button>
        )}
        {ltxVocabulary[slot].map((group) => (
          <span className="slot-chips__group" key={group.id}>
            <span className="slot-chips__label">
              {group.label}
              {group.source === "studio" ? " · studio" : ""}
            </span>
            {group.chips.map((item) =>
              chip(item.label, item.label, item.phrase, group.join),
            )}
          </span>
        ))}
        <span className="slot-chips__group">
          <span className="slot-chips__label">Examples · studio</span>
          {ltxExamples[slot].map((item) =>
            chip(
              item.id,
              item.label,
              item.text,
              "sentence",
              "slot-chip slot-chip--example",
            ),
          )}
        </span>
      </div>
    </div>
  );
}
