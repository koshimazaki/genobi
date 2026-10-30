import { useLayoutEffect, useRef, useState } from "react";
export function EditorResize({ title }: { title: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const [height, setHeight] = useState<number>();
  const start = useRef<{
    pointer: number;
    y: number;
    height: number;
    original: number | undefined;
  } | null>(null);
  useLayoutEffect(() => {
    const panel = button.current?.closest<HTMLElement>("[data-panel]");
    if (!panel) return;
    panel.dataset.editorResize = "";
    if (height) {
      panel.style.setProperty("--editor-panel-height", `${height}px`);
      panel.style.setProperty(
        "--editor-canvas-height",
        `${Math.max(130, height - 95)}px`,
      );
    } else {
      panel.style.removeProperty("--editor-panel-height");
      panel.style.removeProperty("--editor-canvas-height");
    }
    return () => {
      delete panel.dataset.editorResize;
      panel.style.removeProperty("--editor-panel-height");
      panel.style.removeProperty("--editor-canvas-height");
    };
  }, [height]);
  const resize = (v: number) =>
    setHeight(Math.max(200, Math.min(1400, Math.round(v / 8) * 8)));
  return (
    <button
      ref={button}
      className="editor-panel-resize"
      aria-label={`Resize ${title}`}
      title="Drag vertically or use Up/Down. Home restores natural height. Escape cancels."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        start.current = {
          pointer: e.pointerId,
          y: e.clientY,
          height:
            e.currentTarget.closest<HTMLElement>("[data-panel]")!.offsetHeight,
          original: height,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start.current?.pointer === e.pointerId)
          resize(start.current.height + e.clientY - start.current.y);
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onLostPointerCapture={() => {
        start.current = null;
      }}
      onPointerCancel={() => {
        if (start.current) setHeight(start.current.original);
        start.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && start.current) {
          setHeight(start.current.original);
          start.current = null;
        }
        if (e.key === "Home") {
          e.preventDefault();
          setHeight(undefined);
        }
        if (["ArrowUp", "ArrowDown"].includes(e.key)) {
          e.preventDefault();
          resize(
            (height ??
              e.currentTarget.closest<HTMLElement>("[data-panel]")!
                .offsetHeight) +
              (e.key === "ArrowDown" ? 1 : -1) * (e.shiftKey ? 64 : 16),
          );
        }
      }}
    >
      <span aria-hidden="true">↕</span>
    </button>
  );
}
