import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../components/Icon";
import { Host } from "./AssetRail";
import { ExpandedShelf } from "./ExpandedShelf";
import { useShell } from "./ShellContext";
import "./assets-expanded.css";

type Collection = "project" | "inspirations" | "gallery";
export const collectionLabel = (id: Collection) =>
  id === "project"
    ? "Project"
    : id === "inspirations"
      ? "Inspirations"
      : "Library";

const PHONE = "(max-width: 700px)";
/** Escape is the view's unless a light view (any open dialog) has it. */
function escape(
  e: Pick<KeyboardEvent, "key" | "defaultPrevented">,
  onClose: () => void,
) {
  if (e.key !== "Escape" || e.defaultPrevented) return false;
  if (!document.querySelector("dialog[open]")) onClose();
  return true;
}

/**
 * The Assets rail, expanded into a full-screen gallery over the studio: the
 * same collections and the same selected tab, with large Camera-gallery
 * cards and a light view. Library is the rail's own gallery host, moved here
 * while the view is open. A drag that starts here lets the studio beneath
 * take the drop, so dragging out works exactly as it does from the rail.
 */
export function ExpandedAssets({
  collections,
  tab,
  onTab,
  onClose,
}: {
  collections: readonly Collection[];
  tab: Collection;
  onTab: (id: Collection) => void;
  onClose: () => void;
}) {
  const shell = useShell()!;
  const root = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Phones keep the tool dock reachable: the view starts under it.
  useLayoutEffect(() => {
    const place = () => {
      const dock = document.querySelector(".genobi-modebar");
      if (!dock || !window.matchMedia?.(PHONE).matches) return setTop(0);
      setTop(Math.max(0, Math.round(dock.getBoundingClientRect().bottom)));
    };
    const dock = document.querySelector(".genobi-modebar");
    if (dock && window.matchMedia?.(PHONE).matches)
      dock.scrollIntoView?.({ block: "start" });
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.getElementById(`expanded-assets-tab-${tab}`)?.focus();
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Escape closes the view, unless a light view (any open dialog) takes it.
  // The rail around this view never sees it, so the rail stays open. Keys
  // from Library cards (another React subtree) arrive on the document.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (escape(e, onClose)) e.preventDefault();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  // Native events, so Library cards (another React tree) count as well.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    const start = () => {
      // After the drag image is taken, or the browser cancels the drag.
      frame = requestAnimationFrame(() => setDragging(true));
    };
    const end = () => {
      cancelAnimationFrame(frame);
      setDragging(false);
    };
    el.addEventListener("dragstart", start);
    el.addEventListener("dragend", end);
    document.addEventListener("drop", end);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("dragstart", start);
      el.removeEventListener("dragend", end);
      document.removeEventListener("drop", end);
    };
  }, []);
  // On the shell itself, so its styles apply but no rail or panel clips or
  // stacks it; React events still bubble to the rail, so Escape stops here.
  return createPortal(
    <div
      ref={root}
      className="assets-expanded"
      role="dialog"
      aria-label="Assets gallery"
      data-dragging={dragging || undefined}
      style={{ top }}
      onKeyDown={(e) => {
        if (escape(e, onClose)) e.stopPropagation();
      }}
    >
      <div className="assets-expanded-inner">
        <header className="gallery-heading assets-expanded-heading">
          <div>
            <span className="section-eyebrow">Assets</span>
            <h2>{collectionLabel(tab)}</h2>
          </div>
          <div
            className="gallery-filters"
            role="tablist"
            aria-label="Asset collection"
          >
            {collections.map((id) => (
              <button
                key={id}
                id={`expanded-assets-tab-${id}`}
                role="tab"
                className={tab === id ? "active" : undefined}
                aria-selected={tab === id}
                aria-controls={`expanded-assets-pane-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => onTab(id)}
                onKeyDown={(e) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  const count = collections.length;
                  const index = collections.indexOf(id);
                  const next =
                    collections[
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? count - 1
                          : (index + (e.key === "ArrowRight" ? 1 : count - 1)) %
                            count
                    ]!;
                  onTab(next);
                  document
                    .getElementById(`expanded-assets-tab-${next}`)
                    ?.focus();
                }}
              >
                {collectionLabel(id)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-button assets-expanded-close"
            aria-label="Close expanded assets"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        {collections.map((id) => (
          <div
            key={id}
            role="tabpanel"
            id={`expanded-assets-pane-${id}`}
            aria-labelledby={`expanded-assets-tab-${id}`}
            hidden={id !== tab}
          >
            {id === "gallery" ? (
              <>
                <div hidden={shell.preset === "dual"}>
                  <Host node={shell.hosts.gallery} />
                </div>
                <div hidden={shell.preset !== "dual"}>
                  <Host node={shell.hosts.toolAssets} />
                </div>
              </>
            ) : (
              id === tab && (
                <ExpandedShelf
                  role={id === "project" ? "production" : "reference"}
                  onLeave={onClose}
                />
              )
            )}
          </div>
        ))}
      </div>
    </div>,
    document.querySelector(".genobi-shell") ?? document.body,
  );
}
