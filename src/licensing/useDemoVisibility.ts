import { useEffect, useRef, useState } from "react";

/** Only keep visible demos running; unloading frames releases their GPU contexts. */
export function useDemoVisibility() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [enabled, setEnabled] = useState<boolean>();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduced(motion.matches);
    updateMotion();
    motion.addEventListener("change", updateMotion);
    let inView = false;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    observer.observe(node);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const playing = enabled ?? !reduced;
  return {
    ref,
    active: visible && playing,
    playing,
    toggle: () => setEnabled(!playing),
  };
}
