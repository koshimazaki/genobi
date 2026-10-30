/**
 * Document Picture-in-Picture for World Builder panels. Ported from Holodeck's
 * useDocumentPip (MIT, see Holodeck-LICENSE.txt): the PiP window shares this
 * page's JS realm, so a panel moved into it keeps its React state, audio and
 * scopes; only its stylesheets and theme have to be copied across.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type PipHost = {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
};
const pipHost = () =>
  (window as Window & { documentPictureInPicture?: PipHost })
    .documentPictureInPicture;

/** Chromium only, top-level only: an embedded World Builder (the Comfy node's
 *  iframe) has the object but requestWindow refuses outside the top frame. */
export function pipSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!pipHost() &&
    window.parent === window &&
    window.isSecureContext
  );
}

/** Copy every stylesheet: Vite dev injects <style>, the build links CSS, and a
 *  CSSOM-only sheet needs its rules inlined. */
function copyStyles(pip: Window) {
  const head = pip.document.head;
  document
    .querySelectorAll('style, link[rel="stylesheet"]')
    .forEach((node) => head.appendChild(node.cloneNode(true)));
  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.ownerNode) continue; // Already cloned above.
    try {
      const style = pip.document.createElement("style");
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      head.appendChild(style);
    } catch {
      /* A cross-origin sheet without a node: nothing to copy. */
    }
  }
}

/** Mirror the opener's theme (data-theme and classes on <html>) and any
 *  stylesheet added later (Vite hot updates, lazily loaded chunks). */
function syncDocument(pip: Window): () => void {
  const from = document.documentElement,
    to = pip.document.documentElement;
  const theme = () => {
    to.className = from.className;
    for (const name of ["data-theme", "style", "lang"]) {
      const value = from.getAttribute(name);
      if (value === null) to.removeAttribute(name);
      else to.setAttribute(name, value);
    }
  };
  theme();
  const themeWatch = new MutationObserver(theme);
  themeWatch.observe(from, { attributes: true });
  const headWatch = new MutationObserver((records) => {
    for (const record of records)
      record.addedNodes.forEach((node) => {
        if (
          node instanceof HTMLStyleElement ||
          (node instanceof HTMLLinkElement && node.rel === "stylesheet")
        )
          pip.document.head.appendChild(node.cloneNode(true));
      });
  });
  headWatch.observe(document.head, { childList: true });
  return () => {
    themeWatch.disconnect();
    headWatch.disconnect();
  };
}

export type DocumentPip = {
  supported: boolean;
  /** The element panels mount into while popped, else null. */
  root: HTMLElement | null;
  /** Must run inside a user gesture. Resolves false if the window refused. */
  open: (size: { width: number; height: number }) => Promise<boolean>;
  close: () => void;
};

/** One PiP window at a time (Chromium's limit). `onClosed` runs when the
 *  person or the browser closes it, so its panel can dock back. */
export function useDocumentPip(
  onClosed: () => void,
  rootClass: string,
): DocumentPip {
  const [supported] = useState(pipSupported);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const win = useRef<Window | null>(null),
    closed = useRef(onClosed);
  useEffect(() => {
    closed.current = onClosed;
  }, [onClosed]);

  const close = useCallback(() => {
    const pip = win.current;
    win.current = null;
    setRoot(null);
    try {
      pip?.close();
    } catch {
      /* Already gone. */
    }
  }, []);

  const open = useCallback(
    async (size: { width: number; height: number }) => {
      if (win.current && !win.current.closed) return true;
      const host = pipHost();
      if (!supported || !host) return false;
      try {
        const pip = await host.requestWindow(size);
        pip.document.title = "World Builder panel";
        pip.document.body.style.margin = "0";
        copyStyles(pip);
        const stop = syncDocument(pip);
        const mount = pip.document.createElement("div");
        mount.className = rootClass;
        pip.document.body.append(mount);
        pip.addEventListener(
          "pagehide",
          () => {
            stop();
            if (win.current !== pip) return;
            win.current = null;
            setRoot(null);
            closed.current();
          },
          { once: true },
        );
        win.current = pip;
        setRoot(mount);
        return true;
      } catch {
        return false;
      }
    },
    [supported, rootClass],
  );

  // Leaving World Builder must not strand an empty OS window.
  useEffect(() => close, [close]);
  return { supported, root, open, close };
}
