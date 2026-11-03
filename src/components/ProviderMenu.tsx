import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  const current = choices.find((choice) => choice.value === value);
  const columns = Math.min(choices.length, 3);
  const finish = () => {
    setAnchor(null);
    trigger.current?.focus();
  };
  // A run starting while the panel is open closes it. The trigger only
  // marks itself unavailable (aria-disabled) rather than `disabled`, so the
  // keyboard position can come back to it instead of falling to the body.
  useEffect(() => {
    if (!disabled || !anchor) return;
    setAnchor(null);
    trigger.current?.focus();
  }, [disabled, anchor]);
  // The provider tile last focused, for Up/Down from Configure to return to.
  // Opening the panel focuses the current provider, so it starts there.
  const lastTile = useRef<number | null>(null);
  /**
   * Two rows: the provider tiles and the full-width Configure row. Up or
   * Down from any tile goes to Configure, and from Configure back to the
   * tile it came from, else the current provider. Left and Right, and a
   * menu without Configure, keep AnchoredPopover's grid movement.
   */
  const betweenRows = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onConfigure) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const group = event.currentTarget;
    const target = event.target as HTMLElement;
    const configure = group.querySelector<HTMLElement>(
      ".generate-provider-configure",
    );
    const tiles = group.querySelectorAll<HTMLElement>("[data-provider]");
    let next: HTMLElement | null | undefined;
    if (target === configure) {
      const back =
        lastTile.current ??
        Math.max(
          0,
          choices.findIndex((choice) => choice.value === value),
        );
      next = tiles[back];
    } else if (target.dataset.provider !== undefined) {
      next = configure;
    }
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    next.focus();
  };
  return (
    <div className="generate-split__selector">
      <button
        ref={trigger}
        type="button"
        className="generate-split__trigger"
        aria-label={
          current
            ? `Generation provider: ${current.label}`
            : "Generation provider"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        title={
          current
            ? `Generate with ${current.label}`
            : "Choose generation provider"
        }
        aria-disabled={disabled || undefined}
        onClick={(event) => {
          if (!disabled) setAnchor(open ? null : event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
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
          columns={columns}
          align="end"
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
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
            onKeyDown={betweenRows}
          >
            {choices.map((choice, index) => (
              <button
                key={choice.value}
                type="button"
                data-choice
                data-provider={index}
                onFocus={() => {
                  lastTile.current = index;
                }}
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
