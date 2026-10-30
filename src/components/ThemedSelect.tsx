import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import SelectMenu, { type SelectOption } from "./SelectMenu";
import "../styles/themed-select.css";

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? textOf(child.props.children)
        : String(child),
    )
    .join("");
}
function optionsOf(children: ReactNode, disabled = false): SelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{
        children?: ReactNode;
        value?: string | number;
        disabled?: boolean;
        label?: string;
      }>(child)
    )
      return [];
    const p = child.props;
    if (child.type !== "option")
      return optionsOf(p.children, disabled || p.disabled);
    const text = textOf(p.children);
    return [
      {
        value: String(p.value ?? text),
        label: p.label ?? text,
        disabled: disabled || p.disabled,
      },
    ];
  });
}

/**
 * The studio menu over a real select: existing change events, form names and
 * uncontrolled defaults keep their native contract. Only presentation changes.
 */
export default function ThemedSelect({
  children,
  className,
  style,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const explicitLabel = props["aria-label"];
  const generated = useId();
  const id = props.id ?? `select-${generated}`;
  const native = useRef<HTMLSelectElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const options = optionsOf(children);
  const [uncontrolled, setUncontrolled] = useState(
    String(props.defaultValue ?? options[0]?.value ?? ""),
  );
  const [label, setLabel] = useState(
    props["aria-label"] ?? props.name ?? "Choose",
  );
  const value = props.value === undefined ? uncontrolled : String(props.value);
  useEffect(() => {
    if (explicitLabel) return setLabel(explicitLabel);
    const button = document.getElementById(id) as HTMLButtonElement | null;
    const associated = button?.labels?.[0] ?? root.current?.closest("label");
    if (!associated) return;
    const copy = associated.cloneNode(true) as HTMLElement;
    copy
      .querySelectorAll(".themed-select, select")
      .forEach((node) => node.remove());
    const text = copy.textContent?.trim();
    if (text) setLabel(text);
  }, [id, explicitLabel]);
  useEffect(() => {
    const select = native.current;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      // The reset event fires before the browser restores option defaults.
      timer = setTimeout(() => {
        if (select?.isConnected) setUncontrolled(select.value);
      }, 0);
    };
    select?.form?.addEventListener("reset", reset);
    return () => {
      clearTimeout(timer);
      select?.form?.removeEventListener("reset", reset);
    };
  }, []);
  return (
    <div
      ref={root}
      className={`themed-select ${className ?? ""}`}
      style={style}
    >
      <select
        {...props}
        ref={native}
        id={`${id}-native`}
        hidden
        onInvalid={(event) => {
          event.preventDefault();
          document.getElementById(id)?.focus();
          props.onInvalid?.(event);
        }}
        onChange={(event) => {
          setUncontrolled(event.currentTarget.value);
          props.onChange?.(event);
        }}
      >
        {children}
      </select>
      <SelectMenu
        id={id}
        label={label}
        value={value}
        options={options}
        disabled={props.disabled}
        compact
        portal
        onChange={(next) => {
          if (!native.current) return;
          native.current.value = next;
          native.current.dispatchEvent(new Event("change", { bubbles: true }));
        }}
      />
    </div>
  );
}
