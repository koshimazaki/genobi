import { useSyncExternalStore } from "react";

/** Wide enough for the Assets rail to sit beside the workspace (asset-rail.css). */
const DOCKED = "(min-width: 1101px)";

/**
 * Whether the window is wide enough to dock the Assets rail, tracked as the
 * window resizes. Narrower, the rail floats over the workspace, so it should
 * not stay open there unless the person opened it.
 */
export function useDockedRail() {
  return useSyncExternalStore(
    (change) => {
      const query = matchMedia(DOCKED);
      query.addEventListener("change", change);
      return () => query.removeEventListener("change", change);
    },
    () => matchMedia(DOCKED).matches,
    () => false,
  );
}
