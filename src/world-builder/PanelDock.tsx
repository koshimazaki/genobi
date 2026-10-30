import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Icon from "../components/Icon";
import {
  dockPanels,
  dockReducer,
  newlyDocked,
  openPanels,
  type DockAction,
  type DockPanel,
  type DockState,
} from "./panel-dock";
import type { DocumentPip } from "./useDocumentPip";

export const panelTitles: Record<DockPanel, string> = {
  camera: "Camera",
  audio: "Sound",
  capture: "Capture",
  scene: "Scene",
  object: "Object",
};
const PIP_SIZE = { width: 380, height: 640 };

/**
 * The inspector column and the PiP window. Each panel renders once, into its
 * own detached host element, and that element is moved between its docked
 * slot, the PiP window and a hidden stash. Moving the element rather than the
 * React tree keeps every control mounted: audio keeps playing and drafts
 * survive opening, stacking, popping out and docking back.
 */
export function PanelDock({
  dock,
  dispatch,
  pip,
  body,
  monitors = [],
}: {
  dock: DockState;
  dispatch: Dispatch<DockAction>;
  pip: DocumentPip;
  /** A panel's controls; `folded` is true while it is folded to its header. */
  body: (key: DockPanel, folded: boolean) => ReactNode;
  /** Panels that keep a slim monitor in view when folded (Sound's transport). */
  monitors?: readonly DockPanel[];
}) {
  // A one-off message, shown only while the panels are as it describes.
  const [note, setNote] = useState({ text: "", at: "" });
  const placed = openPanels(dock).join();
  const [hosts] = useState(() => {
    const made = {} as Record<DockPanel, HTMLDivElement>;
    for (const key of dockPanels) {
      made[key] = document.createElement("div");
      made[key].className = "wb-dock-host";
    }
    return made;
  });
  const slots = useRef<Partial<Record<DockPanel, HTMLDivElement | null>>>({});
  const stash = useRef<HTMLDivElement>(null);
  // Seeded with the dock the page opened with: restored panels keep focus off.
  const shown = useRef<DockPanel[]>(openPanels(dock));

  // Place every host after each commit; a no-op when nothing moved.
  useLayoutEffect(() => {
    for (const key of dockPanels) {
      const target =
        dock.popped === key && pip.root
          ? pip.root
          : (slots.current[key] ?? stash.current);
      if (target && hosts[key].parentNode !== target)
        target.appendChild(hosts[key]);
    }
    // Focus a newly opened panel's heading, as the single inspector did.
    const added = newlyDocked(shown.current, dock);
    shown.current = openPanels(dock);
    if (added)
      hosts[added]
        .querySelector<HTMLElement>("h2")
        ?.focus({ preventScroll: true });
  });

  // A popped panel closed from its tab takes the window with it. Only the
  // popped → none transition counts: a window that has just opened commits
  // before its popOut does, and must not be closed in between.
  const wasPopped = useRef(dock.popped);
  const { root: pipRoot, close: closePip } = pip;
  useEffect(() => {
    if (wasPopped.current && !dock.popped && pipRoot) closePip();
    wasPopped.current = dock.popped;
  }, [dock.popped, pipRoot, closePip]);

  async function popOut(key: DockPanel) {
    const moving = dock.popped && dock.popped !== key;
    if (!(await pip.open(PIP_SIZE))) {
      setNote({
        text: "The panel window could not open; the panel stays docked.",
        at: placed,
      });
      return;
    }
    const action = { type: "popOut", key } as const;
    dispatch(action);
    setNote({
      text: moving
        ? `${panelTitles[key]} moved into the panel window; ${panelTitles[dock.popped!]} docked back. Only one panel window can be open at a time.`
        : "",
      at: openPanels(dockReducer(dock, action)).join(),
    });
  }
  function close(key: DockPanel) {
    // Return focus to the panel's launcher (or the scene) before it leaves.
    if (hosts[key].contains(hosts[key].ownerDocument.activeElement))
      (
        document.querySelector<HTMLElement>(`[data-wb-launcher="${key}"]`) ??
        document.querySelector<HTMLElement>(".wb-viewport canvas")
      )?.focus({ preventScroll: true });
    dispatch({ type: "close", key });
  }
  function dockBack() {
    pip.close();
    dispatch({ type: "popIn" });
  }

  return (
    <>
      <div className="wb-dock-stack">
        {dock.docked.map((key) => (
          <div
            key={key}
            className="wb-dock-slot"
            data-collapsed={dock.collapsed.includes(key)}
            ref={(el) => {
              slots.current[key] = el;
            }}
          />
        ))}
      </div>
      <p className="wb-hint wb-dock-note" role="status">
        {(note.at === placed && note.text) ||
          (dock.popped
            ? `${panelTitles[dock.popped]} is in its own window; close it to dock back. Popping out another panel moves the window there.`
            : "")}
      </p>
      <div ref={stash} hidden />
      {dockPanels.map((key) => {
        const popped = dock.popped === key && !!pip.root;
        const collapsed = !popped && dock.collapsed.includes(key);
        const title = panelTitles[key];
        return createPortal(
          <section
            className="wb-dock-panel"
            aria-label={`${title} panel`}
            data-popped={popped}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.stopPropagation();
              if (popped) dockBack();
              else close(key);
            }}
          >
            <header>
              <h2 tabIndex={-1}>{title}</h2>
              {!popped && (
                <button
                  aria-label={`${collapsed ? "Expand" : "Collapse"} ${title}`}
                  aria-expanded={!collapsed}
                  onClick={() => dispatch({ type: "collapse", key })}
                >
                  <Icon name="chevron" size={14} />
                </button>
              )}
              {pip.supported && (
                <button
                  aria-label={
                    popped
                      ? `Dock ${title} back`
                      : `Pop ${title} out into its own window`
                  }
                  title={
                    popped
                      ? "Dock back into the inspector"
                      : dock.popped
                        ? `Only one panel window at a time: this moves it from ${panelTitles[dock.popped]} to ${title}`
                        : "Pop out into its own window"
                  }
                  onClick={() => (popped ? dockBack() : void popOut(key))}
                >
                  <Icon name={popped ? "fold" : "expand"} size={14} />
                </button>
              )}
              {!popped && (
                <button
                  aria-label={`Close ${title}`}
                  onClick={() => close(key)}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </header>
            <div
              className="wb-panel-body"
              hidden={collapsed && !monitors.includes(key)}
            >
              {body(key, collapsed)}
            </div>
          </section>,
          hosts[key],
          key,
        );
      })}
    </>
  );
}
