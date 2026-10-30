import { useLayoutEffect, useRef, useState } from "react";
import PromptResizeHandle from "./PromptResizeHandle";

export default function PromptField({
  id,
  label,
  labelClassName = "sr-only",
  value,
  onChange,
  maxLength,
  placeholder,
  resizable = false,
}: {
  id: string;
  label: string;
  labelClassName?: string;
  value: string;
  onChange: (text: string) => void;
  maxLength: number;
  placeholder: string;
  resizable?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const field = ref.current!;
    const resize = () => {
      field.style.height = "auto";
      const height = field.scrollHeight;
      const target =
        resizable && manualHeight !== null
          ? manualHeight
          : Math.min(height, 240);
      field.style.height = `${target}px`;
      field.style.overflowY = height > target ? "auto" : "hidden";
    };
    resize();
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (field.clientWidth !== width) {
        width = field.clientWidth;
        resize();
      }
    });
    observer.observe(field);
    return () => observer.disconnect();
  }, [value, resizable, manualHeight]);
  return (
    <>
      <label className={labelClassName} htmlFor={id}>
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        value={value}
        rows={1}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {resizable && (
        <PromptResizeHandle
          fieldId={id}
          height={() => ref.current?.getBoundingClientRect().height ?? 64}
          onResize={setManualHeight}
        />
      )}
    </>
  );
}
