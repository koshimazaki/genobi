import { useEffect, useRef, useState, type ReactNode } from "react";
import Icon from "../components/Icon";
import { useDraggablePanel } from "./useDraggablePanel";
export function FloatingPanel({
  id,
  title,
  open,
  onClose,
  children,
  side = "right",
}: {
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  side?: "left" | "right";
}) {
  const panel = useDraggablePanel({ minWidth: 260, minHeight: 140 }),
    [folded, setFolded] = useState(false),
    header = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    header.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [open]);
  return (
    <section
      id={id}
      ref={panel.rootRef}
      className={`wb-panel wb-panel--${side}`}
      hidden={!open}
      data-folded={folded}
      role="region"
      aria-label={`${title} panel`}
      style={{ ...panel.dragStyle, ...(folded ? { height: "auto" } : {}) }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header
        ref={header}
        tabIndex={0}
        {...panel.dragHandleProps}
        onKeyDown={(e) => {
          if (
            !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              e.key,
            ) ||
            e.target !== e.currentTarget
          )
            return;
          e.preventDefault();
          const step = e.shiftKey ? 40 : 10;
          panel.nudge(
            e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
            e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
          );
        }}
        aria-label={`Move ${title} panel; drag or use arrow keys`}
      >
        <Icon name="grid" size={12} />
        <h2>{title}</h2>
        <span className="wb-panel-badge">LIVE</span>
        <button
          aria-label={`${folded ? "Expand" : "Fold"} ${title}`}
          onClick={() => setFolded(!folded)}
        >
          <Icon name="chevron" size={14} />
        </button>
        <button aria-label={`Close ${title}`} onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="wb-panel-body" hidden={folded}>
        {children}
      </div>
      <div
        className="wb-resize-grip"
        {...panel.resizeHandleProps}
        aria-hidden="true"
      />
    </section>
  );
}
export function Fold({
  title,
  children,
  open,
}: {
  title: string;
  children: ReactNode;
  /** Start expanded. */
  open?: boolean;
}) {
  return (
    <details className="wb-fold" open={open}>
      <summary>
        {title}
        <Icon name="chevron" size={13} />
      </summary>
      <div>{children}</div>
    </details>
  );
}
