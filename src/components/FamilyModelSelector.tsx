import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Generator, VideoModel } from "../../shared/types";
import {
  entriesFor,
  entryFor,
  entryLabel,
  familiesFor,
  familyName,
  menuId,
  selectionFor,
  type Family,
} from "../../shared/registry";
import { modelOptions } from "./GenerationControls";
import { SelectOptionRow } from "./SelectMenu";
import Icon from "./Icon";
import { useHostedStudio } from "../hosted-studio";
import LocalTick from "./LocalTick";
import { hiddenNote, useLocalFilter } from "../local-menu";

/** Browsing a family never changes the run until a ready model is chosen. */
export default function FamilyModelSelector({
  generator,
  model,
  openOnly,
  onChoose,
  onOpenOnlyChange,
}: {
  generator: Generator;
  model: VideoModel;
  openOnly: boolean;
  onChoose: (choice: { generator: Generator; model: VideoModel }) => void;
  onOpenOnlyChange: (value: boolean) => void;
}) {
  const selected = entryFor(generator, model);
  // The hosted studio leaves out what only the local studio runs (Music 3).
  const hosted = useHostedStudio();
  // Local ticked: only what the local ComfyUI can run (`runsLocally`).
  const keep = useLocalFilter();
  const filter = { openOnly, hosted, keep };
  const [openFamily, setOpenFamily] = useState<Family | null>(null);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const optionsRef = useRef<(HTMLButtonElement | null)[]>([]);
  // A second run of a model is shown under the model's own row.
  const row = menuId(selected);
  const family = openFamily ?? selected.family;
  const options = modelOptions(family, openOnly, hosted, keep);
  const open = openFamily !== null;
  function close(restore = false) {
    setOpenFamily(null);
    if (restore) {
      const target = opener.current?.isConnected
        ? opener.current
        : root.current?.querySelector<HTMLButtonElement>(
            ".family-model__segments button",
          );
      target?.focus();
    }
  }
  function show(next: Family, button: HTMLButtonElement) {
    opener.current = button;
    setActive(
      Math.max(
        0,
        modelOptions(next, openOnly, hosted, keep).findIndex(
          (o) => o.value === row,
        ),
      ),
    );
    setOpenFamily(next);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    // The held row again keeps the held run (open or API).
    const choice = option.value === row ? null : selectionFor(option.value);
    if (choice) onChoose(choice);
    close(true);
  }
  /** Open only, from its own tick or as Local is ticked (Local runs open graphs). */
  function setOpenOnly(checked: boolean) {
    setActive(0);
    // Stay in a family that has open models (Klein is open).
    if (checked && !entriesFor(family, { ...filter, openOnly: true }).length)
      setOpenFamily("ltx");
    onOpenOnlyChange(checked);
  }
  function navigate(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
    const next =
      event.key === "ArrowDown"
        ? (active + 1) % options.length
        : event.key === "ArrowUp"
          ? (active + options.length - 1) % options.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      setActive(next);
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    }
  }
  useEffect(() => {
    if (open) optionsRef.current[Math.min(active, options.length - 1)]?.focus();
  }, [open, active, family, options.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpenFamily(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      className="family-model"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          close();
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          close(true);
        }
      }}
    >
      <div className="instrument-field family-model__field">
        <span className="instrument-label" id="family-model-label">
          Family
        </span>
        <div
          className="family-model__segments"
          role="group"
          aria-label="Model family"
        >
          {familiesFor(filter).map((item) => (
            <button
              key={item}
              type="button"
              className={selected.family === item ? "is-selected" : ""}
              aria-label={`${familyName(item)} models`}
              title={item === "upscale" ? familyName(item) : undefined}
              aria-haspopup="listbox"
              aria-expanded={open && family === item}
              aria-controls={open ? "family-model-options" : undefined}
              onClick={(event) =>
                open && family === item
                  ? close(true)
                  : show(item, event.currentTarget)
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  show(item, event.currentTarget);
                }
              }}
            >
              {/* Upscale is an icon only, so the Family box keeps its width. */}
              {item === "upscale" ? (
                <Icon name="scaling" size={12} />
              ) : (
                item.toUpperCase()
              )}{" "}
              <Icon name="chevron" size={10} />
            </button>
          ))}
        </div>
        {open && (
          <div className="instrument-popover family-model__popover">
            <div className="family-model__menu-heading">
              <span>{familyName(family)} models</span>
              <span className="family-model__ticks">
                <LocalTick
                  onTicked={() => {
                    if (!openOnly) setOpenOnly(true);
                  }}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={openOnly}
                    onChange={(event) => setOpenOnly(event.target.checked)}
                  />{" "}
                  Open only
                </label>
              </span>
            </div>
            <p className="family-model__hidden" aria-live="polite">
              {hiddenNote(family, filter)}
            </p>
            <div
              id="family-model-options"
              role="listbox"
              aria-label={`${familyName(family)} models`}
              onKeyDown={navigate}
            >
              {options.map((option, index) => (
                <SelectOptionRow
                  key={option.value}
                  option={option}
                  ref={(element) => {
                    optionsRef.current[index] = element;
                  }}
                  selected={option.value === row}
                  onFocus={() => setActive(index)}
                  onClick={() => choose(index)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        className="family-model__summary"
        aria-label={`Change model: ${entryLabel(selected)}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? "family-model-options" : undefined}
        onClick={(event) =>
          open ? close(true) : show(selected.family, event.currentTarget)
        }
      >
        <span>{entryLabel(selected)}</span>
        <Icon name="chevron" size={10} />
      </button>
    </div>
  );
}
