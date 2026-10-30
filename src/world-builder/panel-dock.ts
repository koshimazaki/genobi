/**
 * Which inspector panels are open, and where. Up to two dock in the inspector
 * column, oldest first; opening a third replaces the oldest. One more can be
 * popped out into the Document Picture-in-Picture window (Chromium allows a
 * single PiP window per page), and a popped panel does not take a docked slot.
 */
export const dockPanels = [
  "camera",
  "audio",
  "capture",
  "scene",
  "object",
] as const;
export type DockPanel = (typeof dockPanels)[number];
export const MAX_DOCKED = 2;

export type DockState = {
  /** Docked panels, oldest first; at most MAX_DOCKED. */
  docked: DockPanel[];
  /** The panel shown in the PiP window, if any. */
  popped: DockPanel | null;
  /** Docked panels whose body is folded to the header. */
  collapsed: DockPanel[];
};

export type DockAction =
  | { type: "toggle"; key: DockPanel }
  | { type: "open"; key: DockPanel }
  | { type: "close"; key: DockPanel }
  | { type: "collapse"; key: DockPanel }
  | { type: "popOut"; key: DockPanel }
  /** The PiP window closed: its panel docks back. */
  | { type: "popIn" };

export const emptyDock: DockState = { docked: [], popped: null, collapsed: [] };

const without = (list: DockPanel[], key: DockPanel) =>
  list.filter((k) => k !== key);

/** Dock `key` as the newest panel, dropping the oldest past the cap. */
function dock(state: DockState, key: DockPanel): DockState {
  if (state.popped === key || state.docked.includes(key)) return state;
  const docked = [...state.docked, key];
  const dropped = docked.slice(0, Math.max(0, docked.length - MAX_DOCKED));
  return {
    ...state,
    docked: docked.slice(-MAX_DOCKED),
    collapsed: state.collapsed.filter((k) => !dropped.includes(k)),
  };
}

export function dockReducer(state: DockState, action: DockAction): DockState {
  switch (action.type) {
    case "open":
      // Opening a folded panel unfolds it, so the request is visible.
      return dock(
        { ...state, collapsed: without(state.collapsed, action.key) },
        action.key,
      );
    case "toggle":
      if (state.docked.includes(action.key) || state.popped === action.key)
        return dockReducer(state, { type: "close", key: action.key });
      return dockReducer(state, { type: "open", key: action.key });
    case "close":
      return {
        docked: without(state.docked, action.key),
        popped: state.popped === action.key ? null : state.popped,
        collapsed: without(state.collapsed, action.key),
      };
    case "collapse":
      if (!state.docked.includes(action.key)) return state;
      return {
        ...state,
        collapsed: state.collapsed.includes(action.key)
          ? without(state.collapsed, action.key)
          : [...state.collapsed, action.key],
      };
    case "popOut": {
      if (state.popped === action.key) return state;
      // The one PiP window moves to this panel; the previous one docks back.
      const freed: DockState = {
        docked: without(state.docked, action.key),
        popped: null,
        collapsed: without(state.collapsed, action.key),
      };
      const back = state.popped ? dock(freed, state.popped) : freed;
      return { ...back, popped: action.key };
    }
    case "popIn":
      return state.popped
        ? dock({ ...state, popped: null }, state.popped)
        : state;
  }
}

/** Parse a stored dock; anything unexpected falls back to nothing open. */
export function parseDock(text: string | null): DockState {
  try {
    const raw = JSON.parse(text ?? "null") as unknown;
    if (!raw || typeof raw !== "object") return emptyDock;
    const known = (v: unknown): v is DockPanel =>
      typeof v === "string" && (dockPanels as readonly string[]).includes(v);
    const list = (v: unknown) =>
      Array.isArray(v) ? [...new Set(v.filter(known))] : [];
    const docked = list((raw as DockState).docked).slice(-MAX_DOCKED);
    // A PiP window never survives a reload, so a popped panel restores docked.
    const popped = (raw as DockState).popped;
    const restored = known(popped)
      ? dock({ docked, popped: null, collapsed: [] }, popped)
      : { docked, popped: null, collapsed: [] };
    return {
      ...restored,
      collapsed: list((raw as DockState).collapsed).filter((k) =>
        restored.docked.includes(k),
      ),
    };
  } catch {
    return emptyDock;
  }
}

/** Every panel on screen, docked or popped. */
export const openPanels = (state: DockState): DockPanel[] => [
  ...state.docked,
  ...(state.popped ? [state.popped] : []),
];

/**
 * The docked panel the person just opened, whose heading takes focus. Seed
 * `before` with the dock the page loaded with, so panels restored from storage
 * never steal focus; a panel docking back from its window does not either.
 */
export function newlyDocked(
  before: readonly DockPanel[],
  state: DockState,
): DockPanel | undefined {
  return state.docked.find((k) => !before.includes(k));
}

/** The inspector column shows while any panel is open, popped ones included:
 *  it carries the "in its own window" note, and the viewport keeps its size. */
export const inspectorOpen = (state: DockState) =>
  state.docked.length > 0 || state.popped !== null;
