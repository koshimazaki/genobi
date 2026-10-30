import type { ArenaSlot } from "../../shared/arena";
import Icon from "../components/Icon";
import SelectMenu from "../components/SelectMenu";
import { chooseModel, modelChoices, modelValue } from "./model-choice";

/**
 * A load's model, chosen from the studio's own menu (the one the Camera's
 * controls use). Choosing a row takes effect at once: the menu lists every
 * model whatever the load currently holds.
 */
export default function ArenaModelMenu({
  id,
  slot,
  disabled,
  onChange,
}: {
  /** Unique per menu: the generator and each card show one per load. */
  id: string;
  slot: ArenaSlot;
  disabled?: boolean;
  onChange: (change: Partial<ArenaSlot>) => void;
}) {
  return (
    <SelectMenu
      id={id}
      label={`Model for ${slot.label}`}
      value={modelValue(slot)}
      compact
      portal
      disabled={disabled}
      options={modelChoices().map((choice) => ({
        value: choice.value,
        label: choice.label,
        tag: choice.tag || undefined,
        note: choice.note,
        icon: (
          <Icon
            name={
              choice.generator === "image"
                ? "image"
                : choice.generator
                  ? "camera"
                  : "film"
            }
            size={13}
          />
        ),
      }))}
      onChange={(value) => onChange(chooseModel(slot, value))}
    />
  );
}
