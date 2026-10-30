import { LTX_GUIDE_URL } from "../../shared/camera";
import {
  lightGroups,
  type LightSelection,
  type LightTermId,
} from "../../shared/light";
import Icon from "./Icon";

/**
 * The Light tab of the LTX camera panel: the LTX-2.5 guide's Lighting, Color
 * palette and Atmosphere terms, one or None per group. Its colour is
 * `--camera-light`; every choice keeps its text label.
 */
export default function LightPicker({
  selected,
  onSelect,
}: {
  selected: LightSelection;
  onSelect: (selection: LightSelection) => void;
}) {
  return (
    <div className="light-picker">
      {lightGroups.map((group) => (
        <div
          key={group.id}
          className="light-group"
          role="group"
          aria-labelledby={`light-${group.id}`}
        >
          <span className="light-group__label" id={`light-${group.id}`}>
            {group.label}
          </span>
          <div className="light-group__terms">
            <button
              type="button"
              className={`light-term ${selected[group.id] === null ? "selected" : ""}`}
              aria-pressed={selected[group.id] === null}
              aria-label={`${group.label}: None`}
              onClick={() => onSelect({ ...selected, [group.id]: null })}
            >
              None
            </button>
            {group.terms.map((term) => (
              <button
                type="button"
                key={term.id}
                className={`light-term ${selected[group.id] === term.id ? "selected" : ""}`}
                aria-pressed={selected[group.id] === term.id}
                title={term.ltx}
                onClick={() =>
                  onSelect({
                    ...selected,
                    [group.id]: term.id as LightTermId,
                  })
                }
              >
                {term.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="camera-grid-footer">
        <a
          href={LTX_GUIDE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Light terms in the LTX guide"
        >
          LTX guide <Icon name="arrow" size={10} />
        </a>
        <span className="light-picker__note">
          Guide terms · studio sentences
        </span>
      </div>
    </div>
  );
}
