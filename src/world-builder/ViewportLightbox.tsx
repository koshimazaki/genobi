import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Icon from "../components/Icon";
import "./viewport-lightbox.css";

/** One portal host moves between inline and dialog mounts; the canvas never remounts. */
export function ViewportLightbox({
  children,
  active = true,
  onCamera,
  cameraOpen = false,
  cameraDisabled = false,
}: {
  children: ReactNode;
  active?: boolean;
  onCamera?: () => void;
  cameraOpen?: boolean;
  cameraDisabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [host] = useState(() =>
    typeof document === "undefined" ? null : document.createElement("div"),
  );
  const inline = useRef<HTMLDivElement>(null),
    modal = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const expand = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null),
    restoreFocus = useRef(false);
  const heading = useId();
  const open = () => {
    if (expanded) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    setExpanded(true);
  };
  useEffect(() => {
    if (!active) setExpanded(false);
  }, [active]);
  useLayoutEffect(() => {
    if (!host) return;
    const inlineMount = inline.current;
    const target = expanded ? modal.current : inlineMount;
    if (host.parentElement !== target) target?.append(host);
    if (!expanded) {
      if (restoreFocus.current) {
        const previous = returnFocus.current;
        if (previous?.isConnected) previous.focus();
        else expand.current?.focus();
        restoreFocus.current = false;
      }
      return;
    }
    const layer = dialog.current!;
    layer.showModal();
    close.current?.focus();
    return () => {
      layer.close();
      if (host.parentElement !== inlineMount) inlineMount?.append(host);
      restoreFocus.current = true;
    };
  }, [expanded, host]);
  const content = (
    <div
      className="wb-viewport-frame"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).tagName === "CANVAS") open();
      }}
    >
      {children}
      <div className="wb-viewport-actions">
        {onCamera && (
          <button
            type="button"
            data-wb-launcher="camera"
            aria-label="Camera settings"
            aria-expanded={cameraOpen}
            aria-controls="wb-inspector"
            disabled={cameraDisabled}
            onClick={() => {
              // The outside dock is inert while the native dialog is open.
              setExpanded(false);
              onCamera();
            }}
          >
            <Icon name="camera" size={14} />
            Camera
          </button>
        )}
        <button
          ref={expand}
          className="wb-expand-view"
          type="button"
          hidden={expanded}
          aria-label="Expand 3D scene"
          aria-haspopup="dialog"
          title="Expand scene · or double-click the canvas"
          onClick={open}
        >
          <Icon name="expand" size={14} />
          Expand
        </button>
      </div>
    </div>
  );
  return (
    <>
      <div className="wb-viewport-inline" ref={inline}>
        {!host && content}
      </div>
      <dialog
        ref={dialog}
        className="wb-viewport-dialog"
        aria-labelledby={heading}
        onCancel={(event) => {
          event.preventDefault();
          setExpanded(false);
        }}
        onClose={() => setExpanded(false)}
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setExpanded(false);
          }
        }}
      >
        <header>
          <div>
            <strong id={heading}>3D scene</strong>
            <span>Play, scrub and inspect the same scene.</span>
          </div>
          <button
            ref={close}
            type="button"
            aria-label="Close expanded 3D scene"
            onClick={() => setExpanded(false)}
          >
            <Icon name="close" size={15} />
            Close
          </button>
        </header>
        <div className="wb-viewport-dialog-body" ref={modal} />
      </dialog>
      {host && createPortal(content, host)}
    </>
  );
}
