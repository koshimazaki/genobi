import { useCallback, useEffect, useState } from "react";
import { VIEWS, type View } from "./channel-layout";

/**
 * Per-viewer timeline presentation: which views show, view locks, the row
 * order and row heights. None of it is project data: it never changes the
 * compositing stack, a layer, a prompt or a direction, and it is not in Undo.
 * Kept in this browser only, and the timeline works without it.
 */
export interface ViewState {
  hidden: boolean;
  locked: boolean;
  removed: boolean;
}
interface Stored {
  views: Record<View, ViewState>;
  heights: Record<string, number>;
  order: Record<string, string[]>;
}
const KEY = "genobi.editor-timeline.v1";
const fresh = (): Stored => ({
  views: Object.fromEntries(
    VIEWS.map((v) => [v, { hidden: false, locked: false, removed: false }]),
  ) as Record<View, ViewState>,
  heights: {},
  order: {},
});

function load(): Stored {
  const base = fresh();
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return base;
    const r = raw as Partial<Stored>;
    for (const v of VIEWS) {
      const s = r.views?.[v];
      if (s && typeof s === "object")
        base.views[v] = {
          hidden: s.hidden === true,
          locked: s.locked === true,
          removed: s.removed === true,
        };
    }
    for (const [k, n] of Object.entries(r.heights ?? {}))
      if (typeof n === "number" && n >= 24 && n <= 240) base.heights[k] = n;
    for (const [k, list] of Object.entries(r.order ?? {}))
      if (Array.isArray(list))
        base.order[k] = list.filter((x) => typeof x === "string").slice(0, 300);
  } catch {
    // Private windows and blocked storage: defaults.
  }
  return base;
}

export function useTimelineView(projectId: string) {
  const [state, setState] = useState(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Presentation only; nothing is lost but the arrangement.
    }
  }, [state]);
  const view = useCallback(
    (v: View, patch: Partial<ViewState>) =>
      setState((s) => ({
        ...s,
        views: { ...s.views, [v]: { ...s.views[v], ...patch } },
      })),
    [],
  );
  const height = useCallback(
    (row: string, n: number) =>
      setState((s) => ({ ...s, heights: { ...s.heights, [row]: n } })),
    [],
  );
  const order = useCallback(
    (rows: string[]) =>
      setState((s) => ({ ...s, order: { ...s.order, [projectId]: rows } })),
    [projectId],
  );
  return {
    views: state.views,
    heights: state.heights,
    order: state.order[projectId] ?? [],
    view,
    height,
    setOrder: order,
  };
}
