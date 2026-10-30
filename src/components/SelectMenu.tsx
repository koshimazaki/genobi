import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import Icon from "./Icon";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  /**
   * A row shown but not choosable: it stays in the list so the visitor can see
   * what is coming, with `note` as its title and `tag` beside its name.
   */
  disabled?: boolean;
  note?: string;
  tag?: string;
}

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  disabled?: boolean;
  compact?: boolean;
  triggerIcon?: ReactNode;
  portal?: boolean;
}

export default function SelectMenu({
  id,
  label,
  value,
  onChange,
  options,
  disabled = false,
  compact = false,
  triggerIcon,
  portal = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 0,
    maxHeight: 320,
  });
  // The document and window the trigger lives in: a panel popped out into a
  // Picture-in-Picture window has its own, and the popover must follow it.
  const host = () => {
    const doc = root.current?.ownerDocument ?? document;
    return { doc, win: doc.defaultView ?? window };
  };
  const place = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const { innerWidth, innerHeight } = host().win;
    const width = Math.min(Math.max(rect.width, 200), innerWidth - 24);
    const below = innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const height = Math.min(
      320,
      Math.max(below, above),
      options.length * 44 + 12,
    );
    setPosition({
      left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)),
      top:
        below >= height ? rect.bottom + 6 : Math.max(12, rect.top - height - 6),
      width,
      maxHeight: height,
    });
  };
  const optionButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.find((option) => option.value === value);
  const labelId = `${id}-label`;
  const listId = `${id}-options`;

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  function show() {
    if (disabled || !options.length) return;
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    if (portal) place();
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
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
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    }
  }

  useEffect(() => {
    if (!open) return;
    optionButtons.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      // Not `instanceof Node`: a node in another window has that window's Node.
      const target = event.target as Node | null;
      if (
        typeof target?.nodeType === "number" &&
        !root.current?.contains(target) &&
        !menu.current?.contains(target)
      ) {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const { doc } = host();
    doc.addEventListener("pointerdown", outside);
    return () => doc.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open || !portal) return;
    const update = () => place();
    const { win } = host();
    win.addEventListener("resize", update);
    win.addEventListener("scroll", update, true);
    return () => {
      win.removeEventListener("resize", update);
      win.removeEventListener("scroll", update, true);
    };
  });
  const popup =
    open && !disabled ? (
      <div
        ref={menu}
        id={listId}
        role="listbox"
        aria-labelledby={labelId}
        className={`instrument-popover select-menu__options${portal ? " themed-select-popover" : ""}`}
        style={
          portal ? { position: "fixed", ...position, zIndex: 2000 } : undefined
        }
      >
        {options.map((option, index) => (
          <SelectOptionRow
            key={option.value}
            ref={(element) => {
              optionButtons.current[index] = element;
            }}
            option={option}
            selected={option.value === value}
            onFocus={() => setActive(index)}
            onClick={() => choose(index)}
          />
        ))}
      </div>
    ) : null;

  return (
    <div
      ref={root}
      className={`instrument-field select-menu${compact ? " select-menu--compact" : ""}`}
      data-disabled={disabled || undefined}
      onKeyDown={navigate}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null) &&
          !menu.current?.contains(event.relatedTarget as Node | null)
        )
          close();
      }}
    >
      {portal ? (
        <span id={labelId} className="instrument-label">
          {label}
        </span>
      ) : (
        <label htmlFor={id} id={labelId} className="instrument-label">
          {label}
        </label>
      )}
      <button
        ref={trigger}
        id={id}
        type="button"
        className="instrument-trigger select-menu__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${id}-value`}
        onClick={() => (open ? close(true) : show())}
        onKeyDown={(event) => {
          if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            event.stopPropagation();
            show();
          }
        }}
      >
        {triggerIcon ?? selected?.icon}
        <span id={`${id}-value`} className="select-menu__value">
          {selected?.label ?? value}
        </span>
        <Icon name="chevron" size={11} />
      </button>
      {portal && popup
        ? createPortal(
            popup,
            root.current?.closest("dialog") ?? host().doc.body,
          )
        : popup}
    </div>
  );
}

/**
 * One row of the open list. A disabled row is still focusable, so arrow keys
 * reach it and a screen reader announces it as unavailable, but choosing it
 * does nothing: it never carries a check, and `choose` skips it.
 */
export function SelectOptionRow({
  option,
  selected,
  ref,
  onFocus,
  onClick,
}: {
  option: SelectOption;
  selected: boolean;
  ref?: Ref<HTMLButtonElement>;
  onFocus?: () => void;
  onClick?: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={option.disabled || undefined}
      title={option.note}
      tabIndex={-1}
      className="select-menu__option"
      onFocus={onFocus}
      onClick={onClick}
    >
      {option.icon}
      <span>{option.label}</span>
      {option.tag && <span className="select-menu__tag">{option.tag}</span>}
      <span className="select-menu__check">
        {selected && <Icon name="check" size={12} />}
      </span>
    </button>
  );
}
