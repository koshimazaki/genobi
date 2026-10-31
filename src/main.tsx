import "./preview-crypto";
import TastePanel from "./licensing/TastePanel";
import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import StudioShell from "./studio/StudioShell";
import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "./styles.css";
import MotionTheme from "./motion/MotionTheme";
import StartupConfigurator from "./setup/StartupConfigurator";
import { lazyReload, reloadForStaleChunk } from "./lazy-reload";
import { saveBeforeFullReload } from "./director/leave-guard";
// Development: a full reload from Vite (a changed file it cannot hot-swap)
// waits for the project copy's save, so it neither loses an edit nor asks.
saveBeforeFullReload(import.meta.hot);
// A production preload that a new deploy replaced: reload once for the
// current files rather than leaving the view broken.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForStaleChunk()) event.preventDefault();
});
const WorldBuilder = lazyReload(() => import("./world-builder/WorldBuilder"));
// Embedded scene adapters retain their narrow postMessage contract.
const adapter =
  location.pathname.replace(/\/$/, "") === "/scene-adapter" ||
  (location.pathname.replace(/\/$/, "") === "/world-builder" &&
    window.parent !== window);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<p>Opening studio…</p>}>
      {location.pathname.replace(/\/$/, "") === "/taste" ? (
        <TastePanel />
      ) : adapter ? (
        <WorldBuilder />
      ) : (
        <>
          <StudioShell />
          <MotionTheme />
          <StartupConfigurator />
        </>
      )}
    </Suspense>
  </React.StrictMode>,
);
