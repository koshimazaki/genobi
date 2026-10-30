import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { PrimitivePicker } from "./PrimitivePicker";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
export function BuildToolbar({
  s,
  e,
  onInspect,
}: {
  s: BuilderSession;
  e: WorldEditor;
  onInspect: () => void;
}) {
  // Build's actions stop Play first; only its drag handles lock while it plays.
  const disabled = !s.ready || s.busy || s.recipe.scene === "neuro";
  // The primitives chooser opens beside Add, not in the inspector column.
  const [adding, setAdding] = useState(false);
  const add = useRef<HTMLButtonElement>(null);
  const build = e.mode === "edit";
  useEffect(() => {
    if (!build) setAdding(false);
  }, [build]);
  const close = () => {
    setAdding(false);
    add.current?.focus({ preventScroll: true });
  };
  // While open, Escape anywhere (focus may be on Add or in the Object panel
  // after a placement) and a press outside the picker and Add close it.
  // Capture phase: Escape closes the picker before any panel sees it.
  useEffect(() => {
    if (!adding) return;
    const doc = add.current?.ownerDocument ?? document;
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (!!add.current?.contains(target) ||
        !!doc.getElementById("wb-primitive-picker")?.contains(target));
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setAdding(false);
      add.current?.focus({ preventScroll: true });
    };
    const onPointer = (event: PointerEvent) => {
      if (!inside(event.target)) setAdding(false);
    };
    doc.addEventListener("keydown", onKey, true);
    doc.addEventListener("pointerdown", onPointer, true);
    return () => {
      doc.removeEventListener("keydown", onKey, true);
      doc.removeEventListener("pointerdown", onPointer, true);
    };
  }, [adding]);
  return (
    <>
      <div
        className="wb-tool-rail"
        role="toolbar"
        aria-label="Build tools"
        hidden={!build}
      >
        {(
          [
            ["translate", "arrow", "Move", "W"],
            ["rotate", "refresh", "Rotate", "E"],
            ["scale", "expand", "Size", "R"],
          ] as const
        ).map(([tool, icon, label, key]) => (
          <button
            key={tool}
            aria-label={label}
            title={`${label} (${key})`}
            aria-pressed={e.tool === tool}
            disabled={disabled}
            onClick={() => e.chooseTool(tool)}
          >
            <Icon name={icon} size={18} />
            <span>{label}</span>
            <kbd>{key}</kbd>
          </button>
        ))}
        <hr />
        <button
          ref={add}
          aria-label="Add primitive"
          title="Add primitive"
          aria-expanded={adding}
          aria-controls={adding ? "wb-primitive-picker" : undefined}
          disabled={disabled || s.recipe.objects.length >= 24}
          onClick={() => setAdding(!adding)}
        >
          <Icon name="plus" />
          <span>Add</span>
        </button>
        <button
          aria-label="Object inspector"
          title="Object inspector"
          disabled={disabled}
          onClick={onInspect}
        >
          <Icon name="grid" />
          <span>Object</span>
        </button>
      </div>
      {adding && (
        <PrimitivePicker s={s} e={e} disabled={disabled} onClose={close} />
      )}
    </>
  );
}
