import { useCallback, useEffect, useReducer } from "react";
import {
  dockReducer,
  parseDock,
  type DockPanel,
  type DockState,
} from "./panel-dock";
import { useDocumentPip } from "./useDocumentPip";

/** Only the four launcher panels persist: Object follows a selection, and
 *  would reopen empty after a reload. */
const persisted: readonly DockPanel[] = ["camera", "audio", "scene", "capture"];

/** One key per World Builder surface: the studio tab, /world-builder and
 *  /scene-adapter (also when embedded) each remember their own panels. */
export function dockStorageKey(inShell: boolean): string {
  const surface = inShell
    ? "studio"
    : location.pathname.replace(/\/$/, "").replace(/^\//, "") || "root";
  return `genobi-world-panels:${surface}`;
}

function load(key: string): DockState {
  let stored: DockState;
  try {
    stored = parseDock(localStorage.getItem(key));
  } catch {
    return parseDock(null);
  }
  return {
    docked: stored.docked.filter((k) => persisted.includes(k)),
    popped: null,
    collapsed: stored.collapsed.filter((k) => persisted.includes(k)),
  };
}

export function useDockedPanels(inShell: boolean) {
  const key = dockStorageKey(inShell);
  const [dock, dispatch] = useReducer(dockReducer, key, load);
  useEffect(() => {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          docked: dock.docked.filter((k) => persisted.includes(k)),
          popped:
            dock.popped && persisted.includes(dock.popped) ? dock.popped : null,
          collapsed: dock.collapsed.filter((k) => persisted.includes(k)),
        }),
      );
    } catch {
      /* Panels still work for this visit. */
    }
  }, [key, dock]);
  const dockBack = useCallback(() => dispatch({ type: "popIn" }), []);
  const pip = useDocumentPip(dockBack, "wb-app wb-panel wb-pip");
  return { dock, dispatch, pip };
}
