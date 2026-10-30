import { useLayoutEffect, useRef, type RefObject } from "react";
/** Measure the current visual position, including any interrupted transition. */
export function usePanelMotion(
  root: RefObject<HTMLDivElement | null>,
  layout: string,
) {
  const previous = useRef(new Map<string, DOMRect>());
  const animations = useRef<Animation[]>([]);
  function measure() {
    previous.current.clear();
    root.current
      ?.querySelectorAll<HTMLElement>("[data-panel]")
      .forEach((el) => {
        if (!el.hidden)
          previous.current.set(el.dataset.panel!, el.getBoundingClientRect());
      });
    animations.current.forEach((a) => a.cancel());
    animations.current = [];
  }
  useLayoutEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.current
      ?.querySelectorAll<HTMLElement>("[data-panel]")
      .forEach((el) => {
        if (el.hidden) return;
        const before = previous.current.get(el.dataset.panel!);
        const after = el.getBoundingClientRect();
        if (!after.width || !after.height) return;
        const frames = before
          ? [
              {
                transform: `translate(${before.x - after.x}px,${before.y - after.y}px) scale(${before.width / after.width},${before.height / after.height})`,
                opacity: 1,
              },
              { transform: "none", opacity: 1 },
            ]
          : [
              { transform: "translateY(12px)", opacity: 0 },
              { transform: "none", opacity: 1 },
            ];
        animations.current.push(
          el.animate(frames, {
            duration: before ? 700 : 260,
            easing: "cubic-bezier(.22,1,.36,1)",
          }),
        );
      });
    return () => {
      animations.current.forEach((a) => a.cancel());
      animations.current = [];
    };
  }, [layout, root]);
  return measure;
}
