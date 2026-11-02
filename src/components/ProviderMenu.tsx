import { useEffect, useRef, useState } from "react";
import AnchoredPopover from "./AnchoredPopover";
import Icon from "./Icon";
import "../director/direction-popover.css";
import "../styles/generate-provider.css";

export interface ProviderChoice {
  value: string;
  label: string;
}

/** The short badge on the trigger: who runs the next generation. */
export function providerBadge(value?: string) {
  return value === "bfl" ? "BFL" : value === "comfy" ? "COMFY" : "AUTO";
}

/**
 * The provider half of the split Generate button. It opens the same panel
 * as the Editor's direction picker: a titled header, text tiles for each
 * provider with the current one outlined in the accent, and a full-width
 * row that opens Studio settings instead of changing the provider. Arrow
 * keys move between the tiles, Escape closes and focus returns to the
 * trigger. It stays usable while Generate itself is blocked.
 */
export default function ProviderMenu({
  choices,
  value,
  disabled,
  onChange,
  onConfigure,
}: {
  choices: readonly ProviderChoice[];
  value?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onConfigure?: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  // The open popover's anchor; null while closed.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = anchor !== null;
  useEffect(() => {
    if (disabled) setAnchor(null);
  }, [disabled]);
  const current = choices.find((choice) => choice.value === value);
  const finish = () => {
    setAnchor(null);
    trigger.current?.focus();
  };
  return (
    <div className="generate-split__selector">
      <button
        ref={trigger}
        type="button"
        className="generate-split__trigger"
        aria-label="Generation provider"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={
          current
            ? `Generate with ${current.label}`
            : "Choose generation provider"
        }
        disabled={disabled}
        onClick={(event) => setAnchor(open ? null : event.currentTarget)}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setAnchor(event.currentTarget);
          }
        }}
      >
        <span className="generate-split__provider" aria-hidden="true">
          {providerBadge(value)}
        </span>
        <Icon name="chevron" size={10} />
      </button>
      {anchor && (
        <AnchoredPopover
          anchor={anchor}
          label="Generation provider"
          close={() => setAnchor(null)}
          width={300}
          className="dir-direction-popover generate-provider-popover"
        >
          <header>
            <strong>Generation provider</strong>
            <span>{current?.label ?? "Not chosen"}</span>
            <button
              type="button"
              className="dir-direction-close"
              aria-label="Close provider menu"
              data-dismiss
            >
              <Icon name="close" size={12} />
            </button>
          </header>
          <div
            className="dir-direction-choices generate-provider-choices"
            role="group"
            aria-label="Provider"
            style={{
              gridTemplateColumns: `repeat(${Math.min(choices.length, 3)}, minmax(0, 1fr))`,
            }}
          >
            {choices.map((choice) => (
              <button
                key={choice.value}
                type="button"
                data-choice
                aria-pressed={choice.value === value}
                onClick={() => {
                  if (choice.value !== value) onChange(choice.value);
                  finish();
                }}
              >
                <span>{choice.label}</span>
              </button>
            ))}
            {onConfigure && (
              <button
                type="button"
                data-choice
                className="generate-provider-configure"
                onClick={() => {
                  finish();
                  onConfigure();
                }}
              >
                <span>Configure API keys / run location…</span>
              </button>
            )}
          </div>
          <footer>Applies to the next run · Esc closes</footer>
        </AnchoredPopover>
      )}
    </div>
  );
}
