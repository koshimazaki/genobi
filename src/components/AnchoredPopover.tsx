import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import "./anchored-popover.css";

/**
 * A popover placed at the control that opened it, in a portal so no scroll
 * container clips it, kept inside the viewport. Escape and a pointer outside
 * close it; closing returns focus to the anchor. `columns` turns the arrow
 * keys into grid navigation over `[data-choice]` buttons; without it Up and
 * Down move through them as a list.
 */
export default function AnchoredPopover({
  anchor,
  label,
  close,
  children,
  className = "",
  width = 332,
  columns,
  role = "dialog",
}: {
  anchor: HTMLElement;
  label: string;
  close: () => void;
  children: ReactNode;
  className?: string;
  width?: number;
  columns?: number;
  role?: "dialog" | "menu";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: -9999, top: 0 });
  useLayoutEffect(() => {
    function place() {
      const r = anchor.getBoundingClientRect(),
        viewport = document.documentElement.clientWidth,
        w = Math.min(width, viewport - 24),
        h = ref.current?.offsetHeight ?? 240;
      const below = r.bottom + 6 + h <= window.innerHeight - 12;
      setPosition({
        left: Math.max(12, Math.min(r.left, viewport - w - 12)),
        top: Math.max(
          12,
          below
            ? r.bottom + 6
            : Math.min(r.top - h - 6, window.innerHeight - h - 12),
        ),
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, width]);
  // Callers often pass `close` inline; reading it through a ref keeps a
  // parent's re-render (every frame during playback) from refocusing the
  // first choice and losing the keyboard position.
  const closeRef = useRef(close);
  useLayoutEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    const first =
      ref.current?.querySelector<HTMLElement>(
        '[data-choice][aria-pressed="true"]:not(:disabled), [data-choice][aria-checked="true"]:not(:disabled)',
      ) ??
      ref.current?.querySelector<HTMLElement>("[data-choice]:not(:disabled)");
    (first ?? ref.current)?.focus();
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !anchor.contains(target))
        closeRef.current();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [anchor]);
  function done() {
    close();
    if (anchor.isConnected) anchor.focus();
  }
  function keyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      done();
      return;
    }
    const arrows = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"];
    if (!arrows.includes(e.key)) return;
    const choices = Array.from(
      ref.current!.querySelectorAll<HTMLElement>(
        "[data-choice]:not(:disabled)",
      ),
    );
    if (!choices.length) return;
    e.preventDefault();
    e.stopPropagation();
    const at = choices.indexOf(document.activeElement as HTMLElement);
    const step = columns
      ? { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns }[
          e.key
        ]!
      : e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : -1;
    choices[(at + step + choices.length) % choices.length]?.focus();
  }
  return createPortal(
    <div
      ref={ref}
      role={role}
      aria-label={label}
      tabIndex={-1}
      className={`anchored-popover ${className}`}
      style={{ ...position, width: Math.min(width, window.innerWidth - 24) }}
      onKeyDown={keyDown}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-dismiss]")) done();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
