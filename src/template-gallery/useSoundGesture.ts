import { useEffect, useState } from "react";

/** Sound is eligible only after interaction; the browser still decides on play. */
export function useSoundGesture() {
  const [allowed, setAllowed] = useState(
    () => navigator.userActivation?.hasBeenActive ?? false,
  );
  useEffect(() => {
    const gesture = () => setAllowed(true);
    document.addEventListener("pointerdown", gesture);
    document.addEventListener("click", gesture);
    document.addEventListener("keydown", gesture);
    return () => {
      document.removeEventListener("pointerdown", gesture);
      document.removeEventListener("click", gesture);
      document.removeEventListener("keydown", gesture);
    };
  }, []);
  return allowed;
}
