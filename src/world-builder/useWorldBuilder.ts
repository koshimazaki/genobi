import { useEffect, useRef } from "react";
import { validateRecipe, type Recipe } from "./recipe";
/** Only the exact child window opened here can send captures; no wildcard target origins. */
export function useWorldBuilder(
  onCapture: (blob: Blob, recipe: Recipe) => Promise<void>,
  onError: (message: string) => void,
) {
  const child = useRef<Window | null>(null),
    capture = useRef(onCapture),
    error = useRef(onError);
  useEffect(() => {
    capture.current = onCapture;
    error.current = onError;
  }, [onCapture, onError]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== child.current ||
        !child.current ||
        event.data?.type !== "director:capture"
      )
        return;
      const blob = event.data.blob;
      if (
        !(blob instanceof Blob) ||
        blob.type !== "image/png" ||
        blob.size > 16 * 1024 * 1024
      ) {
        error.current("Invalid World Builder capture.");
        return;
      }
      try {
        const recipe = validateRecipe(event.data.recipe);
        void capture
          .current(blob, recipe)
          .catch((e) =>
            error.current(
              e instanceof Error ? e.message : "Capture could not be loaded.",
            ),
          );
      } catch (e) {
        error.current(e instanceof Error ? e.message : "Invalid scene recipe.");
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);
  function open() {
    if (child.current && !child.current.closed) {
      child.current.focus();
      return;
    }
    child.current = window.open("/world-builder", "_blank");
    if (!child.current)
      error.current("Allow the World Builder window to open.");
  }
  return { open };
}
